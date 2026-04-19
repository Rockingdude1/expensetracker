import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export const pushService = {
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  },

  async getPermission(): Promise<NotificationPermission> {
    return Notification.permission;
  },

  async requestPermission(): Promise<boolean> {
    const result = await Notification.requestPermission();
    return result === 'granted';
  },

  async getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    try {
      return await navigator.serviceWorker.ready;
    } catch {
      return null;
    }
  },

  async subscribe(): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.isSupported()) {
        return { success: false, error: 'Push notifications not supported in this browser' };
      }

      const granted = await this.requestPermission();
      if (!granted) {
        return { success: false, error: 'Notification permission denied' };
      }

      const registration = await this.getRegistration();
      if (!registration) {
        return { success: false, error: 'Service worker not ready' };
      }

      // Check for existing subscription first
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      // Save to Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };

      const subJson = subscription.toJSON();
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys?.p256dh,
          auth: subJson.keys?.auth,
          user_agent: navigator.userAgent.substring(0, 255),
        }, { onConflict: 'user_id,endpoint' });

      if (error) {
        console.error('Error saving push subscription:', error);
        return { success: false, error: 'Failed to save subscription' };
      }

      return { success: true };
    } catch (err) {
      console.error('Error subscribing to push:', err);
      return { success: false, error: 'Failed to subscribe' };
    }
  },

  async unsubscribe(): Promise<{ success: boolean; error?: string }> {
    try {
      const registration = await this.getRegistration();
      if (!registration) return { success: true };

      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return { success: true };

      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: true };

      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', endpoint);

      return { success: true };
    } catch (err) {
      console.error('Error unsubscribing from push:', err);
      return { success: false, error: 'Failed to unsubscribe' };
    }
  },

  async isSubscribed(): Promise<boolean> {
    try {
      const registration = await this.getRegistration();
      if (!registration) return false;
      const subscription = await registration.pushManager.getSubscription();
      return !!subscription;
    } catch {
      return false;
    }
  },
};
