-- ============================================================
-- PATCH: fix "unirme a otro hogar" always reporting an invalid code
-- ============================================================
-- Root cause: the households_member RLS policy only allows a user to
-- SELECT a household they already belong to. The "join household" flow
-- needs the opposite -- looking up someone ELSE's household by their
-- invite code, before joining it. That SELECT was always filtered down
-- to zero rows by RLS regardless of whether the code was correct, and
-- the client code treated "no rows" the same as "wrong code".
--
-- This adds a SECURITY DEFINER function that looks up a household's id
-- by invite code, bypassing RLS for that single lookup only. It never
-- returns the invite_code itself or any other household, so it can't be
-- used to enumerate households -- it only confirms/resolves a code the
-- caller already has.
--
-- Safe to run anytime: this only adds a new function, it does not touch
-- existing tables, RLS policies, or any data already in the database.
-- ============================================================

create or replace function find_household_by_invite_code(p_invite_code text)
returns uuid language sql stable security definer
set search_path = public as $$
  select id from households where invite_code = lower(trim(p_invite_code)) limit 1;
$$;
