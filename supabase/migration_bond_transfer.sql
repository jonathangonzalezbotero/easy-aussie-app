-- Bond can be moved from one rental to another for the same customer (bike → scooter).
alter table rentals drop constraint if exists rentals_bond_status_check;
alter table rentals add constraint rentals_bond_status_check
  check (bond_status in ('awaiting','held','refunded','partially_refunded','retained','transferred'));

-- Why a Stripe subscription payment failed (decline reason from the payment intent / charge).
alter table finance_stripe_subscriptions add column if not exists last_failure_reason text;
alter table finance_stripe_subscriptions add column if not exists last_failed_at timestamptz;

-- Your own name for a transaction. The bank/Stripe description stays untouched for matching and duplicate checks.
alter table finance_transactions add column if not exists label text;
