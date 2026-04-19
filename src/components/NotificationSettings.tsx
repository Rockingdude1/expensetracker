import React, { useState, useEffect } from 'react';
import { Bell, BellOff, Loader2 } from 'lucide-react';
import { pushService } from '../services/pushService';

const NotificationSettings: React.FC = () => {
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    const init = async () => {
      const isSupported = pushService.isSupported();
      setSupported(isSupported);
      if (isSupported) {
        setPermission(await pushService.getPermission());
        setSubscribed(await pushService.isSubscribed());
      }
      setLoading(false);
    };
    init();
  }, []);

  const handleToggle = async () => {
    setLoading(true);
    setMessage(null);

    if (subscribed) {
      const result = await pushService.unsubscribe();
      if (result.success) {
        setSubscribed(false);
        setMessage({ text: 'Notifications disabled.', ok: true });
      } else {
        setMessage({ text: result.error || 'Failed to disable notifications.', ok: false });
      }
    } else {
      const result = await pushService.subscribe();
      if (result.success) {
        setSubscribed(true);
        setPermission('granted');
        setMessage({ text: 'Notifications enabled! You\'ll be notified on this device.', ok: true });
      } else {
        if (result.error?.includes('denied')) {
          setPermission('denied');
        }
        setMessage({ text: result.error || 'Failed to enable notifications.', ok: false });
      }
    }

    setLoading(false);
  };

  if (!supported) {
    return (
      <div className="flex items-center space-x-3 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
        <BellOff className="h-5 w-5 text-slate-400 flex-shrink-0" />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Push notifications are not supported in this browser.
          {/iPhone|iPad|iPod/.test(navigator.userAgent) && !('standalone' in navigator && (navigator as unknown as { standalone: boolean }).standalone)
            ? ' On iOS, add this app to your Home Screen first.'
            : ''}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
        <div className="flex items-center space-x-3">
          {subscribed
            ? <Bell className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            : <BellOff className="h-5 w-5 text-slate-400 flex-shrink-0" />
          }
          <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">
              Push Notifications
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {subscribed
                ? 'Enabled on this device'
                : permission === 'denied'
                  ? 'Blocked — allow in browser settings'
                  : 'Get notified about expenses & settlements'}
            </p>
          </div>
        </div>

        <button
          onClick={handleToggle}
          disabled={loading || permission === 'denied'}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
            subscribed ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
              subscribed ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
          {loading && (
            <span className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-3 w-3 text-white animate-spin" />
            </span>
          )}
        </button>
      </div>

      {message && (
        <p className={`text-xs px-1 ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          {message.text}
        </p>
      )}

      {subscribed && (
        <p className="text-xs text-slate-400 dark:text-slate-500 px-1">
          Notifications for: shared expenses added, settlements received, friend requests
        </p>
      )}
    </div>
  );
};

export default NotificationSettings;
