-- ============================================================
-- PATCH: give saving categories an explicit destination instead
-- of guessing it from their name
-- ============================================================
-- Until now, money distributed into a type='saving' category was
-- routed to one of the two house_goals running totals by testing
-- whether the category NAME contained the word "casa":
--
--     cat.name.toLowerCase().includes('casa') ? 'house' : 'invest'
--
-- (in ExtraPaymentModal.jsx, twice, and again in Savings.jsx). That
-- silently breaks in three ordinary situations:
--   * renaming "Ahorro casa" to e.g. "Entrada piso" -> every future
--     contribution lands in the investment total instead,
--   * creating a third saving category -> it becomes "invest" by
--     default, with no way to say otherwise,
--   * any category whose name happens to contain "casa" (e.g.
--     "Cosas de casa") -> silently treated as house savings.
--
-- In every case the money goes to the wrong total with no error, and
-- the mistake is only visible much later as a wrong "Ahorrado" figure.
--
-- This adds an explicit column, backfilled with exactly the same rule
-- the code used, so current behaviour is preserved to the euro and
-- only becomes editable from here on.
--
-- Safe to run more than once.
-- ============================================================

alter table categories
  add column if not exists saving_bucket text
  check (saving_bucket in ('house', 'invest'));

-- Backfill reproduces the old name heuristic verbatim, so nothing
-- changes destination as a result of this patch alone.
update categories
set saving_bucket = case
  when lower(name) like '%casa%' then 'house'
  else 'invest'
end
where type = 'saving' and saving_bucket is null;

comment on column categories.saving_bucket is
  'For type=saving only: which house_goals total this category feeds '
  '(my_saved = house, invest_saved = invest). Replaces the old '
  'name-contains-"casa" heuristic.';
