-- ============================================================
-- PATCH: split one purchase across several categories
-- ============================================================
-- A split expense (e.g. one supermarket ticket that was part food,
-- part household) is stored as several ordinary expense rows -- one
-- per category -- that share a split_group id. Every budget, pot and
-- report calculation already works per expense row, so nothing
-- downstream has to change: the parts simply land in their own
-- categories. The group id only lets the interface show them as one
-- purchase and delete them together.
--
-- Nullable, no default: every existing row stays an ordinary,
-- unsplit expense. Safe to run more than once.
-- ============================================================

alter table transactions add column if not exists split_group uuid;

create index if not exists idx_transactions_split_group
  on transactions(split_group) where split_group is not null;

comment on column transactions.split_group is
  'Shared by the parts of one purchase split across categories; null for a normal movement.';
