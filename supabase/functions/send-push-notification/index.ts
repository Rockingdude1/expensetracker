import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function b64uEncode(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function buildVapidJwt(audience: string): Promise<string> {
  const enc = (v: object) => b64uEncode(new TextEncoder().encode(JSON.stringify(v)));
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: VAPID_SUBJECT };
  const signingInput = `${enc(header)}.${enc(payload)}`;

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC', crv: 'P-256',
      d: VAPID_PRIVATE_KEY,
      x: VAPID_PUBLIC_KEY.substring(0, 43),
      y: VAPID_PUBLIC_KEY.substring(43),
      key_ops: ['sign'],
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  return `${signingInput}.${b64uEncode(new Uint8Array(sig))}`;
}

// Send push with NO body — avoids all encryption complexity.
// The service worker shows a generic notification on wake.
async function sendWebPush(endpoint: string, tag: string): Promise<{ ok: boolean; status: number }> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await buildVapidJwt(audience);

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt},k=${VAPID_PUBLIC_KEY}`,
      TTL: '86400',
      Urgency: 'high',
      Topic: tag.substring(0, 32),
    },
  });

  const resBody = await res.text();
  console.log(`Push to ${endpoint.substring(0, 60)}: status=${res.status} body=${resBody}`);
  return { ok: res.ok, status: res.status };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.includes(SUPABASE_SERVICE_ROLE_KEY)) return new Response('Unauthorized', { status: 401 });

  let body: { user_ids: string[]; title: string; body: string; url?: string; tag?: string };
  try { body = await req.json(); } catch { return new Response('Invalid JSON', { status: 400 }); }

  const { user_ids, title, body: msgBody, url = '/', tag = 'expense-tracker' } = body;
  if (!user_ids?.length || !title || !msgBody) return new Response('Missing required fields', { status: 400 });

  console.log(`Sending push to ${user_ids.length} user(s): ${title}`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Store notification so the service worker can fetch it after waking up
  await supabase.from('pending_notifications').insert(
    user_ids.map(uid => ({ user_id: uid, title, body: msgBody, url, tag }))
  );

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth')
    .in('user_id', user_ids);

  if (error) { console.error('DB error:', error); return new Response('DB error', { status: 500 }); }
  if (!subscriptions?.length) {
    console.log('No subscriptions found');
    return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } });
  }

  console.log(`Found ${subscriptions.length} subscription(s)`);

  const expiredEndpoints: string[] = [];
  let sent = 0;

  await Promise.all(subscriptions.map(async (sub: { endpoint: string; p256dh: string; auth: string; user_id: string }) => {
    const result = await sendWebPush(sub.endpoint, tag);
    if (result.ok) { sent++; }
    else if (result.status === 404 || result.status === 410) { expiredEndpoints.push(sub.endpoint); }
  }));

  if (expiredEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
  }

  return new Response(JSON.stringify({ sent, expired: expiredEndpoints.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
