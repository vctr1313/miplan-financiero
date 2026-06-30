-- ============================================================
-- MI PLAN FINANCIERO — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- HOUSEHOLDS (shared space between partners)
-- ────────────────────────────────────────────────────────────
create table households (
  id uuid primary key default uuid_generate_v4(),
  name text not null default 'Mi Hogar',
  invite_code text unique default substring(md5(random()::text), 1, 8),
  created_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- PROFILES (one per auth user)
-- ────────────────────────────────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid references households(id) on delete set null,
  name text,
  birth_year int,
  salary numeric(10,2) default 0,
  dark_mode boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- CATEGORIES (per household, shared)
-- ────────────────────────────────────────────────────────────
create table categories (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  icon text default '📌',
  color text default '#6366f1',
  type text check (type in ('normal','pot','saving')) default 'normal',
  def_pct numeric(5,2) default 5,
  user_pct numeric(5,2) default 5,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- FIXED EXPENSES (per household)
-- ────────────────────────────────────────────────────────────
create table fixed_expenses (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  amount numeric(10,2) not null,
  icon text default '📌',
  category_id uuid references categories(id) on delete set null,
  last_charged_date date,
  created_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- TRANSACTIONS (per user, visible to household)
-- ────────────────────────────────────────────────────────────
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  type text check (type in ('expense','income','transfer','pot-withdrawal')) not null,
  amount numeric(10,2) not null,
  date date not null,
  description text not null,
  category_id uuid references categories(id) on delete set null,
  is_salary boolean default false,
  notes text,
  created_at timestamptz default now()
);

-- Index for fast cycle queries (salary transactions sorted by date)
create index idx_transactions_salary on transactions(household_id, date) where is_salary = true;
create index idx_transactions_household_date on transactions(household_id, date desc);

-- ────────────────────────────────────────────────────────────
-- HOUSE GOALS (per household)
-- ────────────────────────────────────────────────────────────
create table house_goals (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid unique references households(id) on delete cascade,
  target numeric(12,2) default 200000,
  dp_pct numeric(5,2) default 30,
  my_saved numeric(12,2) default 0,
  pair_mode text default 'solo',
  p_salary numeric(10,2) default 0,
  p_pct numeric(5,2) default 20,
  p_saved numeric(12,2) default 0,
  mort_pair_mode text default 'solo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- SAVING GOALS (multiple goals per household)
-- ────────────────────────────────────────────────────────────
create table saving_goals (
  id uuid primary key default uuid_generate_v4(),
  household_id uuid references households(id) on delete cascade,
  name text not null,
  icon text default '🎯',
  target numeric(12,2) not null,
  saved numeric(12,2) default 0,
  target_date date,
  color text default '#6366f1',
  created_at timestamptz default now()
);

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────
alter table households enable row level security;
alter table profiles enable row level security;
alter table categories enable row level security;
alter table fixed_expenses enable row level security;
alter table transactions enable row level security;
alter table house_goals enable row level security;
alter table saving_goals enable row level security;

-- Profiles: users can only see/edit their own
create policy "profiles_own" on profiles for all using (auth.uid() = id);

-- Households: members can see their household
create policy "households_member" on households for all
  using (id in (select household_id from profiles where id = auth.uid()));

-- Lookup a household by invite code, for joining one you aren't a member
-- of yet. Plain SELECT can't do this -- households_member only allows
-- seeing a household you already belong to, so a user pasting a valid
-- invite code for a household they're about to join would always get
-- zero rows back from RLS, indistinguishable from a wrong code. This
-- function runs as security definer to bypass that, but only ever
-- returns the id (never invite_code or other rows), so it can't be used
-- to enumerate households.
create or replace function find_household_by_invite_code(p_invite_code text)
returns uuid language sql stable security definer
set search_path = public as $$
  select id from households where invite_code = lower(trim(p_invite_code)) limit 1;
$$;

-- Helper function: get current user's household_id
create or replace function get_my_household()
returns uuid language sql stable security definer as $$
  select household_id from profiles where id = auth.uid() limit 1;
$$;

-- Categories: household members
create policy "categories_household" on categories for all
  using (household_id = get_my_household());

-- Fixed expenses: household members
create policy "fixed_expenses_household" on fixed_expenses for all
  using (household_id = get_my_household());

-- Transactions: household members (see all), but only own user can insert/update/delete
create policy "transactions_select" on transactions for select
  using (household_id = get_my_household());
create policy "transactions_insert" on transactions for insert
  with check (user_id = auth.uid() and household_id = get_my_household());
create policy "transactions_update" on transactions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "transactions_delete" on transactions for delete
  using (user_id = auth.uid());

-- House goals: household members
create policy "house_goals_household" on house_goals for all
  using (household_id = get_my_household());

-- Saving goals: household members
create policy "saving_goals_household" on saving_goals for all
  using (household_id = get_my_household());

-- ────────────────────────────────────────────────────────────
-- CLEANUP: delete a household if it has no members left
-- Called from the client after joinHousehold reassigns a user
-- ────────────────────────────────────────────────────────────
create or replace function cleanup_empty_household(target_household_id uuid)
returns void language plpgsql security definer as $$
begin
  if not exists (select 1 from profiles where household_id = target_household_id) then
    delete from households where id = target_household_id;
  end if;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- TRIGGER: auto-create profile + household on signup
-- ────────────────────────────────────────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  new_household_id uuid;
begin
  -- Create a household for the new user
  insert into households (name) values ('Mi Hogar')
  returning id into new_household_id;

  -- Create their profile
  insert into profiles (id, household_id, name)
  values (new.id, new_household_id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)));

  -- Create default house goal
  insert into house_goals (household_id) values (new_household_id);

  -- Create default categories
  insert into categories (household_id, name, icon, color, type, def_pct, user_pct, sort_order) values
    (new_household_id, 'Transporte',    '⛽', '#6366f1', 'normal', 8,  8,  1),
    (new_household_id, 'Suscripciones', '📱', '#8b5cf6', 'normal', 4,  4,  2),
    (new_household_id, 'Gimnasio',      '💪', '#0ea5e9', 'normal', 3,  3,  3),
    (new_household_id, 'Comida diaria', '🛒', '#10b981', 'normal', 12, 12, 4),
    (new_household_id, 'Ocio',          '🎉', '#f59e0b', 'normal', 8,  8,  5),
    (new_household_id, 'Ropa',          '👗', '#ec4899', 'pot',    5,  5,  6),
    (new_household_id, 'Regalos',       '🎁', '#f97316', 'pot',    4,  4,  7),
    (new_household_id, 'Viajes',        '✈️', '#14b8a6', 'pot',    6,  6,  8),
    (new_household_id, 'Imprevistos',   '🛡️', '#6b7280', 'pot',    5,  5,  9),
    (new_household_id, 'Ahorro casa',   '🏠', '#4338ca', 'saving', 10, 10, 10),
    (new_household_id, 'Inversión',     '📈', '#059669', 'saving', 10, 10, 11);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ────────────────────────────────────────────────────────────
-- REALTIME: enable for live sync between devices
-- ────────────────────────────────────────────────────────────
alter publication supabase_realtime add table transactions;
alter publication supabase_realtime add table categories;
alter publication supabase_realtime add table fixed_expenses;
alter publication supabase_realtime add table house_goals;
alter publication supabase_realtime add table saving_goals;
