import { supabase } from '../lib/supabase';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export interface TransactionPayload {
  event: RealtimeEvent;
  new: Record<string, any> | null;
  old: Record<string, any> | null;
}

export interface DebtPayload {
  event: RealtimeEvent;
  new: Record<string, any> | null;
  old: Record<string, any> | null;
}

export type TransactionChangeCallback = (payload: TransactionPayload) => void;
export type DebtChangeCallback = (payload: DebtPayload) => void;
type SimpleCallback = () => void;

function debounceWithPayload<T>(
  fn: (payload: T) => void,
  ms: number
): (payload: T) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastPayload: T;
  return (payload: T) => {
    lastPayload = payload;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(lastPayload);
    }, ms);
  };
}

class SubscriptionService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private retryCount: Map<string, number> = new Map();
  private static MAX_RETRIES = 5;

  subscribeToTransactions(userId: string, onChange: TransactionChangeCallback): () => void {
    const key = `transactions:${userId}`;
    this.unsubscribe(key);

    const debouncedOnChange = debounceWithPayload((payload: TransactionPayload) => {
      console.log(`[Realtime] Transaction ${payload.event} detected`);
      onChange(payload);
    }, 300);

    const channel = supabase
      .channel(key)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        (raw: RealtimePostgresChangesPayload<Record<string, any>>) => {
          debouncedOnChange({
            event: raw.eventType as RealtimeEvent,
            new: raw.new && Object.keys(raw.new).length > 0 ? raw.new : null,
            old: raw.old && Object.keys(raw.old).length > 0 ? raw.old : null,
          });
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Transactions subscription: ${status}`);
        if (status === 'CHANNEL_ERROR') {
          this.handleRetry(key, userId, onChange, 'transactions');
        } else if (status === 'SUBSCRIBED') {
          this.retryCount.set(key, 0);
        }
      });

    this.channels.set(key, channel);
    return () => this.unsubscribe(key);
  }

  subscribeToDebts(userId: string, onChange: DebtChangeCallback): () => void {
    const key = `debts:${userId}`;
    this.unsubscribe(key);

    const debouncedOnChange = debounceWithPayload((payload: DebtPayload) => {
      console.log(`[Realtime] Debt ${payload.event} detected`);
      onChange(payload);
    }, 300);

    const channel = supabase
      .channel(key)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'debts' },
        (raw: RealtimePostgresChangesPayload<Record<string, any>>) => {
          debouncedOnChange({
            event: raw.eventType as RealtimeEvent,
            new: raw.new && Object.keys(raw.new).length > 0 ? raw.new : null,
            old: raw.old && Object.keys(raw.old).length > 0 ? raw.old : null,
          });
        }
      )
      .subscribe((status) => {
        console.log(`[Realtime] Debts subscription: ${status}`);
        if (status === 'CHANNEL_ERROR') {
          this.handleRetry(key, userId, onChange, 'debts');
        } else if (status === 'SUBSCRIBED') {
          this.retryCount.set(key, 0);
        }
      });

    this.channels.set(key, channel);
    return () => this.unsubscribe(key);
  }

  private unsubscribe(key: string) {
    const channel = this.channels.get(key);
    if (channel) {
      supabase.removeChannel(channel);
      this.channels.delete(key);
    }
    const timer = this.retryTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.retryTimers.delete(key);
    }
  }

  unsubscribeAll() {
    for (const key of this.channels.keys()) {
      this.unsubscribe(key);
    }
    this.retryCount.clear();
  }

  private handleRetry(
    key: string,
    userId: string,
    onChange: TransactionChangeCallback | DebtChangeCallback,
    table: 'transactions' | 'debts'
  ) {
    const count = (this.retryCount.get(key) || 0) + 1;
    this.retryCount.set(key, count);

    if (count > SubscriptionService.MAX_RETRIES) {
      console.warn(`[Realtime] Max retries reached for ${key}. Giving up.`);
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, count - 1), 30000);
    console.log(`[Realtime] Retrying ${key} in ${delay}ms (attempt ${count})`);

    const timer = setTimeout(() => {
      this.retryTimers.delete(key);
      if (table === 'transactions') {
        this.subscribeToTransactions(userId, onChange as TransactionChangeCallback);
      } else {
        this.subscribeToDebts(userId, onChange as DebtChangeCallback);
      }
    }, delay);

    this.retryTimers.set(key, timer);
  }
}

export const subscriptionService = new SubscriptionService();
