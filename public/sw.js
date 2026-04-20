// Service Worker for Expense Tracker push notifications

const SUPABASE_URL = 'https://mkyyhxmdtohftqqspptg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1reXloeG1kdG9oZnRxcXNwcHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNzAzNTgsImV4cCI6MjA2OTk0NjM1OH0.SWQV-1q5f_rhXAjrGZ65OPEVZvNf5YiwwvjDisVglsY';

// Supabase stores the session in IndexedDB under this key
const IDB_DB_NAME = 'supabase';
const IDB_STORE_NAME = 'supabase';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));


function readTokenFromIDB() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_DB_NAME);
      req.onerror = () => resolve(null);
      req.onsuccess = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) { resolve(null); return; }
        const tx = db.transaction(IDB_STORE_NAME, 'readonly');
        const store = tx.objectStore(IDB_STORE_NAME);
        // Supabase stores session under a key like "sb-<ref>-auth-token"
        const keyReq = store.getAllKeys();
        keyReq.onsuccess = () => {
          const keys = keyReq.result;
          const authKey = keys.find((k) => typeof k === 'string' && k.includes('auth-token'));
          if (!authKey) { resolve(null); return; }
          const getReq = store.get(authKey);
          getReq.onsuccess = () => {
            try {
              const val = getReq.result;
              // Value may be a string (JSON) or already an object
              const parsed = typeof val === 'string' ? JSON.parse(val) : val;
              resolve(parsed?.access_token ?? parsed?.session?.access_token ?? null);
            } catch { resolve(null); }
          };
          getReq.onerror = () => resolve(null);
        };
        keyReq.onerror = () => resolve(null);
      };
    } catch { resolve(null); }
  });
}

async function getAccessToken() {
  return readTokenFromIDB();
}

async function fetchAndShowNotification() {
  const token = await getAccessToken();

  const fallback = () => self.registration.showNotification('Spendify', {
    body: 'You have a new update. Tap to open.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'expense-tracker',
    renotify: true,
    data: { url: '/' },
  });

  if (!token) return fallback();

  let notif = null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pending_notifications?select=id,title,body,url,tag&order=created_at.asc&limit=1`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const rows = await res.json();
      notif = rows[0] ?? null;
    }
  } catch { /* fall through to fallback */ }

  if (!notif) return fallback();

  // Delete consumed notification (fire-and-forget)
  fetch(`${SUPABASE_URL}/rest/v1/pending_notifications?id=eq.${notif.id}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  }).catch(() => {});

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
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    // Only returns clients controlled by THIS SW — safe to call focus() on
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
