import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useRealtimeTransactions } from '../hooks/useRealtimeTransactions';
import { transactionService } from '../services/transactionService';
import { userService } from '../services/userService';
import { Transaction, UserProfile } from '../types';
import { TransactionPayload, DebtPayload } from '../services/subscriptionService';
import { supabase } from '../lib/supabase';

const SETTLEMENT_PREFIX = 'SETTLEMENT:';

// Data context — changes whenever transactions/balances update
interface TransactionSyncData {
  transactions: Transaction[];
  profilesMap: Map<string, UserProfile>;
  friendBalances: Map<string, number>;
  friends: UserProfile[];
  loading: boolean;
  error: string | null;
  lastSyncedAt: number | null;
}

// Actions context — stable refs, never causes re-renders on its own
interface TransactionSyncActions {
  refreshTransactions: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  refreshFriends: () => Promise<void>;
  refreshAll: (force?: boolean) => Promise<void>;
  addTransactionOptimistic: (transaction: Transaction) => void;
  updateTransactionOptimistic: (id: string, updated: Transaction) => void;
  removeTransactionOptimistic: (id: string) => void;
  rollbackTransactionOptimistic: (id: string) => void;
  setError: (error: string | null) => void;
}

// Keep a combined type for backward compat with existing useTransactionSync consumers
type TransactionSyncState = TransactionSyncData & TransactionSyncActions;

const TransactionSyncDataContext = createContext<TransactionSyncData | undefined>(undefined);
const TransactionSyncActionsContext = createContext<TransactionSyncActions | undefined>(undefined);
// Legacy combined context so existing code keeps working without changes
const TransactionSyncContext = createContext<TransactionSyncState | undefined>(undefined);

export const TransactionSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, UserProfile>>(new Map());
  const profilesMapRef = useRef<Map<string, UserProfile>>(new Map());
  const [friendBalances, setFriendBalances] = useState<Map<string, number>>(new Map());
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const isRefreshing = useRef(false);

  const refreshTransactions = useCallback(async () => {
    if (!user || isRefreshing.current) return;
    isRefreshing.current = true;

    try {
      const fetched = await transactionService.fetchTransactions();

      // Collect all unique user IDs
      const userIds = new Set<string>();
      fetched.forEach(tx => {
        userIds.add(tx.user_id);
        tx.payers?.forEach(p => userIds.add(p.user_id));
        tx.split_details?.participants?.forEach(p => userIds.add(p.user_id));
      });

      // Fetch profiles in parallel with setting transactions
      const profilesPromise = userIds.size > 0
        ? userService.getUsersByIds(Array.from(userIds))
        : Promise.resolve([] as UserProfile[]);

      const [, profiles] = await Promise.all([
        Promise.resolve(setTransactions(fetched)),
        profilesPromise,
      ]);

      const newMap = new Map<string, UserProfile>();
      profiles.forEach(p => newMap.set(p.id, p));
      setProfilesMap(newMap);

      setLastSyncedAt(Date.now());
    } catch (err) {
      console.error('[Sync] Error refreshing transactions:', err);
      setError('Failed to sync transactions. Please refresh.');
    } finally {
      isRefreshing.current = false;
    }
  }, [user]);

  const refreshBalances = useCallback(async () => {
    if (!user) return;

    try {
      const balances = await transactionService.getFriendBalances(user.id);
      setFriendBalances(balances);
      setLastSyncedAt(Date.now());
    } catch (err) {
      console.error('[Sync] Error refreshing balances:', err);
    }
  }, [user]);

  const refreshFriends = useCallback(async () => {
    if (!user) return;
    try {
      const friendsList = await userService.getFriends();
      setFriends(friendsList);
    } catch (err) {
      console.error('[Sync] Error refreshing friends:', err);
    }
  }, [user]);

  const refreshAll = useCallback(async (force = false) => {
    // Skip if data is less than 30 seconds old and not forced
    if (!force && lastSyncedAt && Date.now() - lastSyncedAt < 30_000) return;
    setLoading(true);
    try {
      await Promise.all([refreshTransactions(), refreshBalances(), refreshFriends()]);
    } finally {
      setLoading(false);
    }
  }, [refreshTransactions, refreshBalances, refreshFriends, lastSyncedAt]);

  // Optimistic update helpers
  const addTransactionOptimistic = useCallback((transaction: Transaction) => {
    setTransactions(prev => [transaction, ...prev]);
  }, []);

  const updateTransactionOptimistic = useCallback((id: string, updated: Transaction) => {
    setTransactions(prev => prev.map(t => t.id === id ? updated : t));
  }, []);

  const removeTransactionOptimistic = useCallback((id: string) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, deleted_at: new Date().toISOString() } : t));
  }, []);

  // Hard-removes a record — only for rolling back failed optimistic adds
  const rollbackTransactionOptimistic = useCallback((id: string) => {
    setTransactions(prev => prev.filter(t => t.id !== id));
  }, []);

  // Keep ref in sync so async callbacks can read current map without closures
  useEffect(() => { profilesMapRef.current = profilesMap; }, [profilesMap]);

  // Initial load when user changes — always force, ignore staleness check
  useEffect(() => {
    if (user) {
      refreshAll(true);
    } else {
      setTransactions([]);
      setProfilesMap(new Map());
      setFriendBalances(new Map());
      setFriends([]);
      setLastSyncedAt(null);
    }
  }, [user?.id]);

  // Surgical handler for transaction realtime events
  const handleTransactionChange = useCallback(async (payload: TransactionPayload) => {
    const { event, new: newRow, old: oldRow } = payload;

    if (event === 'DELETE') {
      const deletedId = oldRow?.id;
      if (deletedId) {
        setTransactions(prev => prev.filter(t => t.id !== deletedId));
        await refreshBalances();
        setLastSyncedAt(Date.now());
      }
      return;
    }

    if (!newRow?.id) {
      console.warn('[Realtime] Missing payload id, falling back to full refresh');
      await refreshAll();
      return;
    }

    // Always fetch the full row from DB — realtime payloads may omit JSONB columns
    // (payers, split_details) when REPLICA IDENTITY is not FULL, or when a system
    // trigger fires an UPDATE that delivers a partial row.
    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', newRow.id)
        .single();

      if (error || !data) {
        // Row may not be visible to current user (RLS) — ignore silently
        return;
      }

      const fresh: Transaction = {
        id: data.id,
        user_id: data.user_id,
        type: data.type,
        amount: Number(data.amount),
        payment_mode: data.payment_mode,
        description: data.description || '',
        date: data.date,
        category: data.category,
        payers: data.payers || [],
        split_details: data.split_details ?? null,
        activity_log: data.activity_log || [],
        deleted_at: data.deleted_at,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };

      if (event === 'INSERT') {
        setTransactions(prev => {
          // Replace optimistic temp record or deduplicate real record
          const hasTemp = prev.some(t => t.id.startsWith('temp-') && t.description === fresh.description);
          if (hasTemp) {
            return prev.map(t =>
              (t.id.startsWith('temp-') && t.description === fresh.description) ? fresh : t
            );
          }
          if (prev.some(t => t.id === fresh.id)) return prev;
          return [fresh, ...prev];
        });
      } else {
        // UPDATE — replace existing record
        setTransactions(prev => prev.map(t => t.id === fresh.id ? fresh : t));
      }

      // Cache any newly seen profiles — check against current ref snapshot first,
      // then fire the async fetch and merge result via a normal setState call.
      const allIds = [fresh.user_id, ...(fresh.payers?.map(p => p.user_id) ?? []), ...(fresh.split_details?.participants?.map(p => p.user_id) ?? [])];
      const needed = allIds.filter(id => !profilesMapRef.current.has(id));
      if (needed.length > 0) {
        userService.getUsersByIds(needed).then(profiles => {
          setProfilesMap(current => {
            const next = new Map(current);
            profiles.forEach(p => next.set(p.id, p));
            return next;
          });
        });
      }

      const affectsBalances =
        fresh.type === 'shared' ||
        (fresh.type === 'personal' && fresh.description?.startsWith(SETTLEMENT_PREFIX)) ||
        !!fresh.deleted_at;
      if (affectsBalances) await refreshBalances();

    } catch (err) {
      console.error('[Realtime] Error fetching fresh transaction, falling back:', err);
      await refreshAll();
    }

    setLastSyncedAt(Date.now());
  }, [refreshAll, refreshBalances]);

  // Debt changes always mean balances changed — refresh them surgically
  const handleDebtChange = useCallback(async (_payload: DebtPayload) => {
    console.log('[Realtime] Debt change — refreshing balances only');
    await refreshBalances();
  }, [refreshBalances]);

  // Set up real-time subscriptions
  useRealtimeTransactions(
    user?.id,
    handleTransactionChange,
    handleDebtChange
  );

  // Staleness warning: check if data is older than 1 minute
  useEffect(() => {
    if (!lastSyncedAt) return;

    const interval = setInterval(() => {
      const age = Date.now() - lastSyncedAt;
      if (age > 60000) {
        console.warn('[Sync] Data is stale (older than 1 minute). Consider refreshing.');
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [lastSyncedAt]);

  // Memoize so consumers only re-render when the actual data changes
  const dataValue = useMemo<TransactionSyncData>(() => ({
    transactions,
    profilesMap,
    friendBalances,
    friends,
    loading,
    error,
    lastSyncedAt,
  }), [transactions, profilesMap, friendBalances, friends, loading, error, lastSyncedAt]);

  // Actions are all stable useCallback refs — object identity never changes
  const actionsValue = useMemo<TransactionSyncActions>(() => ({
    refreshTransactions,
    refreshBalances,
    refreshFriends,
    refreshAll,
    addTransactionOptimistic,
    updateTransactionOptimistic,
    removeTransactionOptimistic,
    rollbackTransactionOptimistic,
    setError,
  }), [refreshTransactions, refreshBalances, refreshFriends, refreshAll, addTransactionOptimistic, updateTransactionOptimistic, removeTransactionOptimistic, rollbackTransactionOptimistic, setError]);

  const combinedValue = useMemo<TransactionSyncState>(
    () => ({ ...dataValue, ...actionsValue }),
    [dataValue, actionsValue]
  );

  return (
    <TransactionSyncDataContext.Provider value={dataValue}>
      <TransactionSyncActionsContext.Provider value={actionsValue}>
        <TransactionSyncContext.Provider value={combinedValue}>
          {children}
        </TransactionSyncContext.Provider>
      </TransactionSyncActionsContext.Provider>
    </TransactionSyncDataContext.Provider>
  );
};

// Combined hook — backward compatible, existing code needs no changes
export const useTransactionSync = () => {
  const context = useContext(TransactionSyncContext);
  if (context === undefined) {
    throw new Error('useTransactionSync must be used within a TransactionSyncProvider');
  }
  return context;
};

// Fine-grained hooks — use these in components that only need data OR actions
// to avoid re-rendering when the other half changes
export const useTransactionData = () => {
  const context = useContext(TransactionSyncDataContext);
  if (context === undefined) {
    throw new Error('useTransactionData must be used within a TransactionSyncProvider');
  }
  return context;
};

export const useTransactionActions = () => {
  const context = useContext(TransactionSyncActionsContext);
  if (context === undefined) {
    throw new Error('useTransactionActions must be used within a TransactionSyncProvider');
  }
  return context;
};
