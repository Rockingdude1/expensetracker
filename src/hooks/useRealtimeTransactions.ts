import { useEffect, useRef, useCallback } from 'react';
import { subscriptionService, TransactionChangeCallback, DebtChangeCallback } from '../services/subscriptionService';

export function useRealtimeTransactions(
  userId: string | undefined,
  onTransactionChange: TransactionChangeCallback,
  onDebtChange: DebtChangeCallback
) {
  const unsubTransactions = useRef<(() => void) | null>(null);
  const unsubDebts = useRef<(() => void) | null>(null);

  const txCallback = useCallback(onTransactionChange, [onTransactionChange]);
  const debtCallback = useCallback(onDebtChange, [onDebtChange]);

  useEffect(() => {
    if (!userId) {
      unsubTransactions.current?.();
      unsubDebts.current?.();
      unsubTransactions.current = null;
      unsubDebts.current = null;
      return;
    }

    unsubTransactions.current = subscriptionService.subscribeToTransactions(userId, txCallback);
    unsubDebts.current = subscriptionService.subscribeToDebts(userId, debtCallback);

    return () => {
      unsubTransactions.current?.();
      unsubDebts.current?.();
      unsubTransactions.current = null;
      unsubDebts.current = null;
    };
  }, [userId, txCallback, debtCallback]);
}
