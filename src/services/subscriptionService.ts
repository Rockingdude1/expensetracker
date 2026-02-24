import { supabase } from '../lib/supabase';
import { RealtimeChannel } from '@supabase/supabase-js';

type ChangeCallback = () => void;

// Debounce helper to batch multiple rapid changes into a single callback
function debounce(fn: ChangeCallback, ms: number): ChangeCallback {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}

class SubscriptionService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private retryCount: Map<string, number> = new Map();
  private static MAX_RETRIES = 5;

  /**
   * Subscribe to transaction changes for a given user.
   * The callback is debounced by 500ms to batch rapid changes.
   */
  subscribeToTransactions(userId: string, onChange: ChangeCallback): () => void {
    const key = `transactions:${userId}`;
    this.unsubscribe(key);

    const debouncedOnChange = debounce(() => {
      console.log('[Realtime] Transaction change detected, refreshing...');
      onChange();
    }, 500);

    const channel = supabase
      .channel(key)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
        },
        () => debouncedOnChange()
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

  /**
   * Subscribe to debts table changes for a given user.
   */
  subscribeToDebts(userId: string, onChange: ChangeCallback): () => void {
    const key = `debts:${userId}`;
    this.unsubscribe(key);

    const debouncedOnChange = debounce(() => {
      console.log('[Realtime] Debts change detected, refreshing balances...');
      onChange();
    }, 500);

    const channel = supabase
      .channel(key)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'debts',
        },
        () => debouncedOnChange()
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

  /**
   * Subscribe to user_profiles changes (for display name updates, etc.)
   */
  subscribeToProfiles(onChange: ChangeCallback): () => void {
    const key = 'profiles';
    this.unsubscribe(key);

    const debouncedOnChange = debounce(() => {
      console.log('[Realtime] Profile change detected, refreshing...');
      onChange();
    }, 500);

    const channel = supabase
      .channel(key)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_profiles',
        },
        () => debouncedOnChange()
      )
      .subscribe((status) => {
        console.log(`[Realtime] Profiles subscription: ${status}`);
      });

    this.channels.set(key, channel);
    return () => this.unsubscribe(key);
  }

  /**
   * Unsubscribe from a specific channel
   */
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

  /**
   * Unsubscribe from all channels (cleanup)
   */
  unsubscribeAll() {
    for (const key of this.channels.keys()) {
      this.unsubscribe(key);
    }
    this.retryCount.clear();
  }

  /**
   * Retry logic with exponential backoff
   */
  private handleRetry(
    key: string,
    userId: string,
    onChange: ChangeCallback,
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
        this.subscribeToTransactions(userId, onChange);
      } else {
        this.subscribeToDebts(userId, onChange);
      }
    }, delay);

    this.retryTimers.set(key, timer);
  }
}

export const subscriptionService = new SubscriptionService();
