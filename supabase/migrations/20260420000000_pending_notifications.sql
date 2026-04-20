create table if not exists public.pending_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '/',
  tag text not null default 'expense-tracker',
  created_at timestamptz not null default now()
);

alter table public.pending_notifications enable row level security;

create policy "Users can read own pending notifications"
  on public.pending_notifications for select
  using (auth.uid() = user_id);

create policy "Service role can insert"
  on public.pending_notifications for insert
  with check (true);

create policy "Users can delete own pending notifications"
  on public.pending_notifications for delete
  using (auth.uid() = user_id);
