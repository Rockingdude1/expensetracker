import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { useRealtimeTransactions } from '../hooks/useRealtimeTransactions';
import { transactionService } from '../services/transactionService';
import { userService } from '../services/userService';
import { Transaction, UserProfile } from '../types';

interface TransactionSyncState {
  transactions: Transaction[];
  profilesMap: Map<string, UserProfile>;
  friendBalances: Map<string, number>;
  loading: boolean;
  error: string | null;
  lastSyncedAt: number | null;
  refreshTransactions: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  refreshAll: () => Promise<void>;
  addTransactionOptimistic: (transaction: Transaction) => void;
  updateTransactionOptimistic: (id: string, updated: Transaction) => void;
  removeTransactionOptimistic: (id: string) => void;
  setError: (error: string | null) => void;
}

const TransactionSyncContext = createContext<TransactionSyncState | undefined>(undefined);

export const TransactionSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profilesMap, setProfilesMap] = useState<Map<string, UserProfile>>(new Map());
  const [friendBalances, setFriendBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const isRefreshing = useRef(false);

  const refreshTransactions = useCallback(async () => {
    if (!user || isRefreshing.current) return;
    isRefreshing.current = true;

    try {
      const fetched = await transactionService.fetchTransactions();
      setTransactions(fetched);

      // Collect all unique user IDs
      const userIds = new Set<string>();
      fetched.forEach(tx => {
        userIds.add(tx.user_id);
        tx.payers?.forEach(p => userIds.add(p.user_id));
        tx.split_details?.participants?.forEach(p => userIds.add(p.user_id));
      });

      if (userIds.size > 0) {
        const profiles = await userService.getUsersByIds(Array.from(userIds));
        const newMap = new Map<string, UserProfile>();
        profiles.forEach(p => newMap.set(p.id, p));
        setProfilesMap(newMap);
      }

      // Calculate monthly balances
      await transactionService.calculateAndStoreMonthlyBalances(user.id, fetched);
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

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await refreshTransactions();
      await refreshBalances();
    } finally {
      setLoading(false);
    }
  }, [refreshTransactions, refreshBalances]);

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

  // Initial load when user changes
  useEffect(() => {
    if (user) {
      refreshAll();
    } else {
      setTransactions([]);
      setProfilesMap(new Map());
      setFriendBalances(new Map());
      setLastSyncedAt(null);
    }
  }, [user?.id]);

  // Set up real-time subscriptions
  useRealtimeTransactions(
    user?.id,
    refreshTransactions,
    refreshBalances
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

  return (
    <TransactionSyncContext.Provider
      value={{
        transactions,
        profilesMap,
        friendBalances,
        loading,
        error,
        lastSyncedAt,
        refreshTransactions,
        refreshBalances,
        refreshAll,
        addTransactionOptimistic,
        updateTransactionOptimistic,
        removeTransactionOptimistic,
        setError,
      }}
    >
      {children}
    </TransactionSyncContext.Provider>
  );
};

export const useTransactionSync = () => {
  const context = useContext(TransactionSyncContext);
  if (context === undefined) {
    throw new Error('useTransactionSync must be used within a TransactionSyncProvider');
  }
  return context;
};
