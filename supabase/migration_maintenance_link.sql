-- Links a service-log entry to the finance transaction that paid for it. Run after migration_finance.sql.
-- Money is only ever counted from finance_transactions; maintenance.cost stays informational.
alter table maintenance add column if not exists transaction_id uuid references finance_transactions(id) on delete set null;
create index if not exists maintenance_transaction on maintenance (transaction_id);
