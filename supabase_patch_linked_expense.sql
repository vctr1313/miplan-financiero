-- Add linked_expense_id to transactions so a reimbursement (transfer)
-- can reference the original expense it offsets.
alter table transactions
  add column if not exists linked_expense_id uuid references transactions(id) on delete set null;

create index if not exists idx_transactions_linked_expense
  on transactions(linked_expense_id)
  where linked_expense_id is not null;
