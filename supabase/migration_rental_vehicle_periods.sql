-- Vehicle history of a rental: when a customer swaps bikes mid-rental, the bike they had before is kept here
-- (who had which vehicle when, e.g. for fines). Only closed periods are stored; the current one is
-- rentals.vehicle_id from the last period's to_date (or the start date) onwards.
-- to_date is the swap day, which is also the first day of the next period.
-- Run in Supabase → SQL Editor. Safe to re-run.

create table if not exists rental_vehicle_periods (
  id          uuid primary key default gen_random_uuid(),
  rental_id   uuid not null references rentals(id) on delete cascade,
  vehicle_id  uuid references vehicles(id) on delete set null,
  from_date   date not null,
  to_date     date not null,
  reason      text,
  created_at  timestamptz default now()
);
create index if not exists rental_vehicle_periods_rental on rental_vehicle_periods (rental_id);
create index if not exists rental_vehicle_periods_vehicle on rental_vehicle_periods (vehicle_id);

alter table rental_vehicle_periods enable row level security;
drop policy if exists "Auth full access" on rental_vehicle_periods;
create policy "Auth full access" on rental_vehicle_periods for all to authenticated using (true) with check (true);
