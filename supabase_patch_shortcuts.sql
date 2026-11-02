-- ── ATAJOS DE IPHONE ─────────────────────────────────────────
-- Lets iOS Shortcuts talk to the app without opening it (see
-- api/shortcut.js): apuntar un gasto al pagar con Apple Pay, gasto
-- rápido con toque trasero, "¿cuánto me queda?" y Bizum recibido.
--
-- shortcut_tokens: one personal token per person. Only its SHA-256 is
--   stored; the app generates the token in the browser and shows it
--   once.
-- merchant_rules: comercio → categoría, learnt the first time you pick
--   a category for a shop, so the next payment there goes straight in.
-- transactions.needs_review: gastos que entraron sin categoría
--   ("Decidir luego" or a shop with no rule yet). They show up in
--   "Pendientes de revisar".
-- transactions.source: where a movement came from ('shortcut-pay',
--   'shortcut-quick', 'shortcut-refund'); null for the app itself.
--
-- Safe to re-run.

alter table transactions add column if not exists needs_review boolean not null default false;
alter table transactions add column if not exists source text;
create index if not exists transactions_needs_review on transactions(household_id) where needs_review;

create table if not exists shortcut_tokens (
  user_id uuid primary key references profiles(id) on delete cascade,
  token_hash text not null unique,
  token_hint text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table shortcut_tokens enable row level security;
drop policy if exists shortcut_tokens_own on shortcut_tokens;
create policy shortcut_tokens_own on shortcut_tokens for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists merchant_rules (
  household_id uuid not null references households(id) on delete cascade,
  merchant_key text not null,
  merchant_label text not null,
  category_id uuid not null references categories(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (household_id, merchant_key)
);
alter table merchant_rules enable row level security;
drop policy if exists merchant_rules_household on merchant_rules;
create policy merchant_rules_household on merchant_rules for all
  using (household_id = get_my_household()) with check (household_id = get_my_household());

-- ── SERVER ROLE ──────────────────────────────────────────────
-- api/shortcut.js connects as this role. It can read what the budget
-- is computed from, add movements and learn shop rules -- and nothing
-- else (it can't edit or delete movements). Like push_worker it needs
-- to see every household, hence bypassrls; the endpoint itself scopes
-- every query to the token's owner.
-- Set its password once, in the SQL editor:
--   alter role shortcut_worker password '<una contraseña larga>';
-- and put the pooler URL with that user/password in the Vercel env var
-- SHORTCUTS_DATABASE_URL.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'shortcut_worker') then
    create role shortcut_worker login bypassrls;
  end if;
end $$;
grant usage on schema public to shortcut_worker;
grant select on profiles, categories, transactions, category_pct_history, fixed_expenses to shortcut_worker;
grant insert on transactions to shortcut_worker;
grant select, update (last_used_at) on shortcut_tokens to shortcut_worker;
grant select, insert, update on merchant_rules to shortcut_worker;
