-- Bond can be moved from one rental to another for the same customer (bike → scooter).
alter table rentals drop constraint if exists rentals_bond_status_check;
alter table rentals add constraint rentals_bond_status_check
  check (bond_status in ('awaiting','held','refunded','partially_refunded','retained','transferred'));

-- Why a Stripe subscription payment failed (decline reason from the payment intent / charge).
alter table finance_stripe_subscriptions add column if not exists last_failure_reason text;
alter table finance_stripe_subscriptions add column if not exists last_failed_at timestamptz;

-- Your own name for a transaction. The bank/Stripe description stays untouched for matching and duplicate checks.
alter table finance_transactions add column if not exists label text;

-- Cash position: what each account held when the ledger starts, and Stripe's live balance.
alter table finance_accounts add column if not exists opening_balance numeric default 0;
alter table finance_accounts add column if not exists opening_date date;
alter table finance_settings add column if not exists stripe_balance numeric;
alter table finance_settings add column if not exists stripe_balance_at timestamptz;

-- Today's balance per account, typed in or taken from the last CSV closing balance.
alter table finance_accounts add column if not exists balance numeric;
alter table finance_accounts add column if not exists balance_at date;
