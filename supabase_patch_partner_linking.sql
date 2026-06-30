-- ============================================================
-- PATCH: replace "join household" (full data merge) with
-- "link partner" (mutual read-only summary link)
-- ============================================================
-- Root cause of the previous behavior: joining a household by invite
-- code re-pointed your profile's household_id to the target household,
-- which is also the scope every RLS policy uses to share categories,
-- transactions, fixed_expenses, saving_goals and house_goals. So
-- "joining" your partner's household meant literally seeing (and
-- editing) all of their data, not a summary.
--
-- This patch keeps each profile's own household_id exactly as it is
-- today (fully private, unchanged) and adds a separate, symmetric
-- partner_id link between two profiles. Looking at a partner's data is
-- only ever done through get_partner_summary() below, which is
-- security definer and returns nothing but aggregates (salary, this
-- cycle's spend, totals) -- never individual transactions or category
-- rows, even via a direct API call.
--
-- Safe to run anytime: adds one nullable column and three functions.
-- Does not touch any existing table, RLS policy, or data.
-- ============================================================

alter table profiles add column if not exists partner_id uuid references profiles(id) on delete set null;

-- Mutually link two profiles by invite code. Looks up the household
-- for that code (security definer, so it can see households you don't
-- own -- same reasoning as find_household_by_invite_code), finds its
-- one profile, and sets partner_id on both sides. Never touches
-- household_id, transactions, or any other table.
create or replace function link_partner_by_invite_code(p_invite_code text)
returns uuid language plpgsql security definer
set search_path = public as $$
declare
  v_target_household_id uuid;
  v_target_profile_id uuid;
begin
  select id into v_target_household_id
    from households
    where invite_code = lower(trim(p_invite_code))
    limit 1;

  if v_target_household_id is null then
    return null;
  end if;

  select id into v_target_profile_id
    from profiles
    where household_id = v_target_household_id
    limit 1;

  if v_target_profile_id is null or v_target_profile_id = auth.uid() then
    return null;
  end if;

  update profiles set partner_id = v_target_profile_id where id = auth.uid();
  update profiles set partner_id = auth.uid() where id = v_target_profile_id;

  return v_target_profile_id;
end;
$$;

-- Clears partner_id on both sides. Needs security definer because the
-- caller's own profiles_own RLS policy only allows updating their own
-- row, not their (former) partner's.
create or replace function unlink_partner()
returns void language plpgsql security definer
set search_path = public as $$
declare
  v_partner_id uuid;
begin
  select partner_id into v_partner_id from profiles where id = auth.uid();
  if v_partner_id is not null then
    update profiles set partner_id = null where id = v_partner_id;
  end if;
  update profiles set partner_id = null where id = auth.uid();
end;
$$;

-- Returns a single row of aggregates about the caller's linked
-- partner, or zero rows if no partner is linked. Deliberately exposes
-- only sums/totals -- never a row from transactions/categories/
-- fixed_expenses directly -- so a partner can see "how's it going"
-- without being able to read individual movements.
create or replace function get_partner_summary()
returns table (
  partner_id uuid,
  partner_name text,
  partner_salary numeric,
  cycle_start date,
  cycle_expenses numeric,
  budget_total numeric,
  saving_pct numeric,
  house_saved numeric,
  saving_goals_total numeric
) language plpgsql stable security definer
set search_path = public as $$
declare
  v_partner_id uuid;
  v_household_id uuid;
  v_cycle_start date;
begin
  select p.partner_id into v_partner_id from profiles p where p.id = auth.uid();
  if v_partner_id is null then
    return;
  end if;

  select p.household_id into v_household_id from profiles p where p.id = v_partner_id;

  -- Same definition of "current cycle" as buildCycles/getCurrentCycle
  -- in src/lib/finance.js: starts at the most recent salary income.
  select max(t.date) into v_cycle_start
    from transactions t
    where t.household_id = v_household_id and t.type = 'income' and t.is_salary = true;

  return query
  select
    p.id,
    p.name,
    p.salary,
    v_cycle_start,
    coalesce((
      select sum(t.amount) from transactions t
      where t.household_id = v_household_id and t.type = 'expense'
        and (v_cycle_start is null or t.date >= v_cycle_start)
    ), 0),
    coalesce(p.salary, 0) * coalesce((
      select sum(c.user_pct) from categories c
      where c.household_id = v_household_id and c.type != 'saving'
    ), 0) / 100,
    coalesce((
      select sum(c.user_pct) from categories c
      where c.household_id = v_household_id and c.type = 'saving'
    ), 0),
    coalesce((select hg.my_saved from house_goals hg where hg.household_id = v_household_id), 0),
    coalesce((select sum(sg.saved) from saving_goals sg where sg.household_id = v_household_id), 0)
  from profiles p
  where p.id = v_partner_id;
end;
$$;
