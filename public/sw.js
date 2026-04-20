// Service Worker for Expense Tracker push notifications

const SUPABASE_URL = 'https://mkyyhxmdtohftqqspptg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1reXloeG1kdG9oZnRxcXNwcHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzAzNTgsImV4cCI6MjA2OTk0NjM1OH0.SWQV-1q5f_rhXAjrGZ65OPEVZvNf5YiwwvjDisVglsY';

// Cache the user's JWT so we can call Supabase from the SW
let cachedAccessToken = null;

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Receive the access token from the app
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SET_AUTH_TOKEN') {
    cachedAccessToken = event.data.token;
  }
});

async function getAccessToken() {
  // Use cached token if available
  if (cachedAccessToken) return cachedAccessToken;

  // Try to get token from an open client window
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) {
    try {
      const token = await new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = (e) => {
          if (e.data?.token) resolve(e.data.token);
          else reject(new Error('No token'));
        };
        client.postMessage({ type: 'GET_AUTH_TOKEN' }, [channel.port2]);
        setTimeout(() => reject(new Error('timeout')), 2000);
      });
      if (token) {
        cachedAccessToken = token;
        return token;
      }
    } catch {
      // try next client
    }
  }
  return null;
}

async function fetchAndShowNotification() {
  const token = await getAccessToken();
  if (!token) {
    // Fallback: show generic notification
    return self.registration.showNotification('Spendify', {
      body: 'You have a new update. Tap to open.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'expense-tracker',
      renotify: true,
      data: { url: '/' },
    });
  }

  // Fetch the oldest pending notification for this user
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/pending_notifications?select=id,title,body,url,tag&order=created_at.asc&limit=1`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    return self.registration.showNotification('Spendify', {
      body: 'You have a new update. Tap to open.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'expense-tracker',
      renotify: true,
      data: { url: '/' },
    });
  }

  const rows = await res.json();
  const notif = rows[0];

  if (!notif) {
    return self.registration.showNotification('Spendify', {
      body: 'You have a new update. Tap to open.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'expense-tracker',
      renotify: true,
      data: { url: '/' },
    });
  }

  // Delete the notification now that we've consumed it
  fetch(
    `${SUPABASE_URL}/rest/v1/pending_notifications?id=eq.${notif.id}`,
    {
      method: 'DELETE',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
    }
  ).catch(() => {});

  return self.registration.showNotification(notif.title || 'Spendify', {
    body: notif.body || 'You have a new update.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: notif.tag || 'expense-tracker',
    renotify: true,
    requireInteraction: false,
    data: { url: notif.url || '/' },
    vibrate: [200, 100, 200],
  });
}

self.addEventListener('push', (event) => {
  event.waitUntil(fetchAndShowNotification());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
