-- ============================================================
-- PATCH: expenses shared with a linked partner
-- ============================================================
-- Each partner keeps a private household (see
-- supabase_patch_partner_linking.sql). This adds the one thing they
-- do see of each other: expenses one of them paid and marked as
-- shared, and the running balance between them.
--
-- How it fits the existing money model: the payer's own movements
-- hold the full expense plus a linked "transfer" for the partner's
-- part -- the same shape as a Bizum reimbursement, which every budget,
-- pot and report calculation already nets out. So the payer's budget
-- only ever carries their own share, from the moment it's recorded.
-- shared_expenses is the cross-household record the partner can see;
-- it never exposes any other transaction.
--
-- Safe to run more than once.
-- ============================================================

create table if not exists shared_expenses (
  id uuid primary key default uuid_generate_v4(),
  payer_id uuid not null references profiles(id) on delete cascade,
  debtor_id uuid not null references profiles(id) on delete cascade,
  -- The payer's full expense, and the linked transfer carrying the
  -- partner's part (both in the payer's private household).
  expense_tx_id uuid references transactions(id) on delete cascade,
  share_tx_id uuid references transactions(id) on delete set null,
  description text not null,
  date date not null,
  total numeric(10,2) not null check (total > 0),
  debtor_share numeric(10,2) not null check (debtor_share > 0 and debtor_share <= total),
  settled_at timestamptz,
  settlement_id uuid,
  created_at timestamptz default now(),
  check (payer_id <> debtor_id)
);

create index if not exists idx_shared_expenses_pair
  on shared_expenses(payer_id, debtor_id) where settled_at is null;

create table if not exists shared_settlements (
  id uuid primary key default uuid_generate_v4(),
  -- who handed money over, to whom, and how much (0 when the two
  -- directions cancelled out exactly)
  from_id uuid not null references profiles(id) on delete cascade,
  to_id uuid not null references profiles(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  items integer not null default 0,
  created_at timestamptz default now()
);

alter table shared_expenses enable row level security;
alter table shared_settlements enable row level security;

-- Either partner reads the pair's shared records; nobody else can.
drop policy if exists shared_expenses_select on shared_expenses;
create policy shared_expenses_select on shared_expenses for select
  using (auth.uid() in (payer_id, debtor_id));

-- Only the payer records one, and only against their CURRENT linked
-- partner -- you can't bill an arbitrary profile.
drop policy if exists shared_expenses_insert on shared_expenses;
create policy shared_expenses_insert on shared_expenses for insert
  with check (
    payer_id = auth.uid()
    and debtor_id = (select p.partner_id from profiles p where p.id = auth.uid())
  );

-- The payer may withdraw one that hasn't been settled yet.
drop policy if exists shared_expenses_delete on shared_expenses;
create policy shared_expenses_delete on shared_expenses for delete
  using (payer_id = auth.uid() and settled_at is null);

-- No direct UPDATE policy: settling goes through the function below.

drop policy if exists shared_settlements_select on shared_settlements;
create policy shared_settlements_select on shared_settlements for select
  using (auth.uid() in (from_id, to_id));

-- Settles every open shared expense between the caller and their
-- partner in one step, recording who paid whom the net amount.
-- security definer because it has to mark the partner's records too;
-- it only ever touches rows of this exact pair.
create or replace function settle_shared_balance()
returns shared_settlements
language plpgsql security definer
set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_partner uuid;
  v_owed_to_me numeric := 0;
  v_owed_by_me numeric := 0;
  v_items integer := 0;
  v_net numeric;
  v_row shared_settlements;
begin
  select partner_id into v_partner from profiles where id = v_me;
  if v_partner is null then
    raise exception 'No tienes pareja vinculada';
  end if;

  -- Lock the open rows so two simultaneous "Saldar" taps can't both run.
  perform 1 from shared_expenses
    where settled_at is null
      and ((payer_id = v_me and debtor_id = v_partner) or (payer_id = v_partner and debtor_id = v_me))
    for update;

  select
    coalesce(sum(case when payer_id = v_me then debtor_share end), 0),
    coalesce(sum(case when payer_id = v_partner then debtor_share end), 0),
    count(*)
  into v_owed_to_me, v_owed_by_me, v_items
  from shared_expenses
  where settled_at is null
    and ((payer_id = v_me and debtor_id = v_partner) or (payer_id = v_partner and debtor_id = v_me));

  if v_items = 0 then
    return null;
  end if;

  v_net := v_owed_to_me - v_owed_by_me;
  insert into shared_settlements (from_id, to_id, amount, items)
  values (
    case when v_net >= 0 then v_partner else v_me end,
    case when v_net >= 0 then v_me else v_partner end,
    abs(v_net),
    v_items
  )
  returning * into v_row;

  update shared_expenses
    set settled_at = now(), settlement_id = v_row.id
    where settled_at is null
      and ((payer_id = v_me and debtor_id = v_partner) or (payer_id = v_partner and debtor_id = v_me));

  return v_row;
end;
$$;

-- Live updates for both partners.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'shared_expenses') then
    alter publication supabase_realtime add table shared_expenses;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'shared_settlements') then
    alter publication supabase_realtime add table shared_settlements;
  end if;
end $$;
