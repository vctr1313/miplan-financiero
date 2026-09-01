-- ============================================================
-- PATCH: historical budget %, pot opening balances, and 3
-- pre-existing schema gaps found while building this
-- ============================================================
-- Fixes reported by the user:
--  1. Retirada de ahorros should not count as income (app-side fix,
--     no schema change needed for that part).
--  2/3. Changing a category's % today must not retroactively change
--     what past cycles/months already accumulated -- adds
--     category_pct_history so every % change is timestamped instead
--     of overwriting a single live value.
--  5. Same root cause as #2 (an inflated/deflated retroactive
--     recompute), fixed by the same history table.
--  7. Lets a user state their real current pot balance as of a given
--     date -- adds categories.opening_balance(_date) as the new
--     baseline calcPotBalance counts forward from, and
--     profiles.balances_reviewed_at to show the one-time prompt once.
--
-- Also fixes 3 gaps found by grepping every *.sql file in this repo
-- against what the app code actually does -- these are pre-existing
-- and unrelated to the request above, but this patch's own features
-- (and some already-shipped ones: "mover entre botes", paga
-- extra/retirada repartidos hacia ahorro) depend on all three:
--  A. transactions.type never allowed 'pot-deposit', even though
--     ExtraPaymentModal.jsx and Savings.jsx's MovePotModal have
--     inserted that type since those features shipped.
--  B. house_goals.invest_saved does not exist as a column, even
--     though House.jsx and the paga-extra flow read/write it.
--  C. increment_house_goal_savings(), called from
--     src/lib/supabase.js, is not defined anywhere in this repo's SQL
--     history.
-- Every statement below is idempotent (create or replace / add ...
-- if not exists / drop ... if exists) so it's safe to run whether or
-- not A/B/C were already patched by hand directly in the SQL editor.
--
-- Safe to run anytime. Does not delete or rewrite any existing row.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- A. transactions.type: allow 'pot-deposit'
-- ────────────────────────────────────────────────────────────
alter table transactions drop constraint if exists transactions_type_check;
alter table transactions add constraint transactions_type_check
  check (type in ('expense','income','transfer','pot-withdrawal','pot-deposit'));

-- ────────────────────────────────────────────────────────────
-- B. house_goals.invest_saved
-- ────────────────────────────────────────────────────────────
alter table house_goals add column if not exists invest_saved numeric(12,2) default 0;

-- ────────────────────────────────────────────────────────────
-- C. increment_house_goal_savings(): turned out to already exist
-- live (hand-patched directly in the SQL editor at some point,
-- never saved to a file in this repo -- confirmed by inspecting the
-- database directly: same logic this patch would have created,
-- already scoped through get_my_household(), already returning the
-- updated house_goals row). Intentionally left untouched: a
-- `create or replace` here would fail because Postgres refuses to
-- change an existing function's return type, and there is nothing to
-- fix -- it already does the right thing.
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- Requirement #2/#3/#5: one row per % change, oldest first.
-- Lets the app resolve "what % was active on date X" instead of
-- always reading today's live categories.user_pct.
-- ────────────────────────────────────────────────────────────
create table if not exists category_pct_history (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid not null references households(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  user_pct numeric(5,2) not null,
  effective_from timestamptz not null default now(),
  created_at timestamptz default now()
);
create index if not exists idx_category_pct_history_lookup
  on category_pct_history(category_id, effective_from desc);

alter table category_pct_history enable row level security;
drop policy if exists "category_pct_history_household" on category_pct_history;
create policy "category_pct_history_household" on category_pct_history for all
  using (household_id = get_my_household());

-- Backfill: one history row per existing category, dated at its own
-- created_at, using its current user_pct as the best-effort baseline
-- for categories whose % has already changed in the past -- the
-- actual historical values were never recorded anywhere, so this is
-- the most accurate starting point that can be reconstructed. Any %
-- change from this point forward is tracked correctly. Guarded so
-- re-running this patch never duplicates rows.
insert into category_pct_history (household_id, category_id, user_pct, effective_from, created_at)
select c.household_id, c.id, c.user_pct, c.created_at, c.created_at
from categories c
where not exists (select 1 from category_pct_history h where h.category_id = c.id);

-- ────────────────────────────────────────────────────────────
-- Requirement #7: manual reset point for a pot's running total.
-- Only meaningful for type='pot' categories. When set, the app
-- starts counting from opening_balance on opening_balance_date
-- instead of from its full calculated history.
-- ────────────────────────────────────────────────────────────
alter table categories add column if not exists opening_balance numeric(10,2) not null default 0;
alter table categories add column if not exists opening_balance_date date;

-- ────────────────────────────────────────────────────────────
-- Requirement #7: gates the one-time "¿tus botes ya tienen dinero
-- acumulado?" prompt so it's shown at most once per user.
-- ────────────────────────────────────────────────────────────
alter table profiles add column if not exists balances_reviewed_at timestamptz;

-- ────────────────────────────────────────────────────────────
-- REALTIME: live sync for the new table, matching every other
-- household-scoped table.
-- ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'category_pct_history'
  ) then
    alter publication supabase_realtime add table category_pct_history;
  end if;
end $$;
