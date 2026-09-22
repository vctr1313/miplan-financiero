-- ── PUSH NOTIFICATIONS ───────────────────────────────────────
-- Daily 20:00 alerts (budget at 80% / over, pot in the red, recap of
-- the cycle that just closed), sent by the Vercel cron in
-- api/cron-alerts.js.
--
-- push_subscriptions: one row per device that switched alerts on.
-- push_log: which alerts each person already got, so each one is sent
-- once (the keys are scoped to a salary cycle -- see src/lib/alerts.js).
--
-- Safe to re-run.

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on push_subscriptions(user_id);
alter table push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select on push_subscriptions;
create policy push_subscriptions_select on push_subscriptions
  for select using (user_id = auth.uid());
drop policy if exists push_subscriptions_delete on push_subscriptions;
create policy push_subscriptions_delete on push_subscriptions
  for delete using (user_id = auth.uid());

-- A browser has one endpoint no matter who is logged in. If someone
-- else used this device before, their row is taken over rather than
-- left behind (they'd keep getting YOUR alerts otherwise) -- which RLS
-- can't express, hence a definer function.
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end $$;
revoke all on function save_push_subscription(text, text, text, text) from public, anon;
grant execute on function save_push_subscription(text, text, text, text) to authenticated;

create table if not exists push_log (
  user_id uuid not null references profiles(id) on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);
-- No policies: only the sender reads/writes it.
alter table push_log enable row level security;

-- ── SENDER ROLE ──────────────────────────────────────────────
-- The cron connects as this role, not as postgres: it can read what
-- the alerts are computed from and manage the two push tables, and
-- nothing else. It needs to see every household, hence bypassrls.
-- Its password is set separately (alter role ... password) and lives
-- only in the Vercel env var ALERTS_DATABASE_URL.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'push_worker') then
    create role push_worker login bypassrls;
  end if;
end $$;
grant usage on schema public to push_worker;
grant select on profiles, categories, transactions, category_pct_history to push_worker;
grant select, delete on push_subscriptions to push_worker;
grant select, insert on push_log to push_worker;
