/*
  Push notification triggers
  Fires the send-push-notification Edge Function for:
    1. New shared expense        → notify all participants except the creator
    2. Settlement recorded       → notify the creditor (person being paid)
    3. Friend request received   → notify the recipient
    4. Friend request accepted   → notify the requester
*/

-- Enable pg_net if not already enabled (required for HTTP calls from triggers)
create extension if not exists pg_net with schema extensions;

-- ============================================================
-- Helper: call the Edge Function with a JSON payload
-- Replace YOUR_PROJECT_REF with your actual Supabase project ref
-- e.g. https://abcdefghijkl.supabase.co
-- ============================================================
create or replace function private.send_push(payload jsonb)
returns void
language plpgsql
security definer
as $$
declare
  _url text := 'https://mkyyhxmdtohftqqspptg.supabase.co/functions/v1/send-push-notification';
  _key text := 'YOUR_SERVICE_ROLE_KEY_HERE';
begin
  perform net.http_post(
    url     := _url,
    body    := payload::text,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || _key
    )
  );
exception when others then
  raise warning 'send_push failed: %', sqlerrm;
end;
$$;

-- ============================================================
-- 1. Shared expense → notify participants (excluding creator)
-- ============================================================
create or replace function private.notify_shared_expense()
returns trigger
language plpgsql
security definer
as $$
declare
  _participant_ids uuid[];
  _creator_name    text;
  _recipient_ids   uuid[];
begin
  -- Only fire for shared expenses that are not soft-deleted
  if new.type <> 'shared' or new.deleted_at is not null then
    return new;
  end if;
  -- Skip settlements
  if new.description like 'SETTLEMENT:%' then
    return new;
  end if;
  -- Only on INSERT (new expense), not on every update
  if TG_OP = 'UPDATE' and old.deleted_at is null then
    return new;
  end if;

  -- Collect participant user_ids from split_details
  select array_agg((p->>'user_id')::uuid)
    into _participant_ids
    from jsonb_array_elements(new.split_details->'participants') as p;

  if _participant_ids is null or array_length(_participant_ids, 1) = 0 then
    return new;
  end if;

  -- Notify everyone except the creator
  _recipient_ids := array_remove(_participant_ids, new.user_id);

  if array_length(_recipient_ids, 1) = 0 then
    return new;
  end if;

  -- Get creator's display name
  select coalesce(display_name, email, 'Someone')
    into _creator_name
    from public.user_profiles
   where id = new.user_id;

  perform private.send_push(jsonb_build_object(
    'user_ids', _recipient_ids,
    'title',    'New shared expense',
    'body',     _creator_name || ' added "' || coalesce(new.description, 'an expense') || '" — ₹' || new.amount::int,
    'url',      '/friends',
    'tag',      'shared-expense-' || new.id
  ));

  return new;
end;
$$;

drop trigger if exists trg_notify_shared_expense on public.transactions;
create trigger trg_notify_shared_expense
  after insert or update on public.transactions
  for each row execute function private.notify_shared_expense();

-- ============================================================
-- 2. Settlement → notify the creditor
-- ============================================================
create or replace function private.notify_settlement()
returns trigger
language plpgsql
security definer
as $$
declare
  _payer_name  text;
  _creditor_id uuid;
  _amount      numeric;
begin
  if new.type <> 'personal' then return new; end if;
  if new.description not like 'SETTLEMENT:%' then return new; end if;
  if TG_OP = 'UPDATE' and old.deleted_at is null then return new; end if;

  -- The creditor id is encoded after "SETTLEMENT:" e.g. "SETTLEMENT:uuid:..."
  begin
    _creditor_id := split_part(new.description, ':', 2)::uuid;
  exception when others then
    return new;
  end;

  if _creditor_id is null or _creditor_id = new.user_id then return new; end if;

  select coalesce(display_name, email, 'Someone')
    into _payer_name
    from public.user_profiles
   where id = new.user_id;

  perform private.send_push(jsonb_build_object(
    'user_ids', array[_creditor_id],
    'title',    'Settlement received',
    'body',     _payer_name || ' settled up ₹' || new.amount::int || ' with you',
    'url',      '/friends',
    'tag',      'settlement-' || new.id
  ));

  return new;
end;
$$;

drop trigger if exists trg_notify_settlement on public.transactions;
create trigger trg_notify_settlement
  after insert on public.transactions
  for each row execute function private.notify_settlement();

-- ============================================================
-- 3. Friend request received → notify recipient (user_id_2)
-- ============================================================
create or replace function private.notify_friend_request()
returns trigger
language plpgsql
security definer
as $$
declare
  _sender_name text;
begin
  if new.status <> 'pending' then return new; end if;

  select coalesce(display_name, email, 'Someone')
    into _sender_name
    from public.user_profiles
   where id = new.user_id_1;

  perform private.send_push(jsonb_build_object(
    'user_ids', array[new.user_id_2],
    'title',    'Friend request',
    'body',     _sender_name || ' sent you a friend request',
    'url',      '/friends',
    'tag',      'friend-request-' || new.id
  ));

  return new;
end;
$$;

drop trigger if exists trg_notify_friend_request on public.user_connections;
create trigger trg_notify_friend_request
  after insert on public.user_connections
  for each row execute function private.notify_friend_request();

-- ============================================================
-- 4. Friend request accepted → notify the requester (user_id_1)
-- ============================================================
create or replace function private.notify_friend_accepted()
returns trigger
language plpgsql
security definer
as $$
declare
  _acceptor_name text;
begin
  if old.status = 'accepted' or new.status <> 'accepted' then return new; end if;

  select coalesce(display_name, email, 'Someone')
    into _acceptor_name
    from public.user_profiles
   where id = new.user_id_2;

  perform private.send_push(jsonb_build_object(
    'user_ids', array[new.user_id_1],
    'title',    'Friend request accepted',
    'body',     _acceptor_name || ' accepted your friend request',
    'url',      '/friends',
    'tag',      'friend-accepted-' || new.id
  ));

  return new;
end;
$$;

drop trigger if exists trg_notify_friend_accepted on public.user_connections;
create trigger trg_notify_friend_accepted
  after update on public.user_connections
  for each row execute function private.notify_friend_accepted();
