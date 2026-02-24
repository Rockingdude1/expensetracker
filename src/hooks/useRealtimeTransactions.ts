import { useEffect, useRef, useCallback } from 'react';
import { subscriptionService } from '../services/subscriptionService';

/**
 * Custom hook that manages Supabase real-time subscriptions
 * for transactions and debts. Prevents duplicate listeners
 * and handles cleanup on unmount.
 */
export function useRealtimeTransactions(
  userId: string | undefined,
  onTransactionChange: () => void,
  onDebtChange: () => void
) {
  const unsubTransactions = useRef<(() => void) | null>(null);
  const unsubDebts = useRef<(() => void) | null>(null);

  // Stable callback refs to avoid re-subscribing on every render
  const txCallback = useCallback(onTransactionChange, [onTransactionChange]);
  const debtCallback = useCallback(onDebtChange, [onDebtChange]);

  useEffect(() => {
    if (!userId) {
      // Clean up if user logs out
      unsubTransactions.current?.();
      unsubDebts.current?.();
      unsubTransactions.current = null;
      unsubDebts.current = null;
      return;
    }

    // Subscribe to transactions changes
    unsubTransactions.current = subscriptionService.subscribeToTransactions(
      userId,
      txCallback
    );

    // Subscribe to debts changes
    unsubDebts.current = subscriptionService.subscribeToDebts(
      userId,
      debtCallback
    );

    // Cleanup on unmount or userId change
    return () => {
      unsubTransactions.current?.();
      unsubDebts.current?.();
      unsubTransactions.current = null;
      unsubDebts.current = null;
    };
  }, [userId, txCallback, debtCallback]);
}
