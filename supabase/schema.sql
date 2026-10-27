-- Fleet Manager — Supabase Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists vehicles (
  id               uuid primary key default gen_random_uuid(),
  plate            text not null,
  name             text,
  make             text,
  model            text,
  year             text,
  colour           text,
  status           text default 'available' check (status in ('available','rented','maintenance')),
  rego_expiry      date,
  next_service_date date,
  engine_capacity  text,
  type             text default 'scooter',
  fleet_group      text default 'business',
  purchase_date    date,
  condition_notes  text,
  notes            text,
  odometer         numeric,
  created_at       timestamptz default now()
);

-- Run this if the table already exists:
-- alter table vehicles add column if not exists odometer numeric;

create table if not exists customers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  date_of_birth     date,
  phone             text,
  email             text,
  address           text,
  occupation        text,
  emergency_contact text,
  emergency_phone   text,
  hotel_address     text,
  license_ref       text,
  licence_photo     text,
  vehicle_type      text check (vehicle_type in ('scooter','ebike','car')),
  terms_accepted_at timestamptz,
  terms_version     text,
  insurance_option  text check (insurance_option in ('standard','reduced')),
  notes             text,
  created_at        timestamptz default now()
);

-- Run this if the customers table already exists:
-- alter table customers add column if not exists vehicle_type text check (vehicle_type in ('scooter','ebike','car'));
-- For terms_accepted_at / terms_version / insurance_option see migration_intake_terms.sql

create table if not exists rentals (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references customers(id) on delete set null,
  vehicle_id    uuid references vehicles(id) on delete set null,
  start_date    date,
  end_date      date,
  status        text default 'active' check (status in ('active','completed')),
  bond_amount   numeric,
  bond_method   text default 'cash',
  bond_status   text default 'held' check (bond_status in ('awaiting','held','refunded','partially_refunded','retained','transferred')),
  bond_refunded_amount numeric,
  bond_retained_amount numeric,
  bond_retain_reason   text,
  bond_refund_method   text,
  bond_refund_date     date,
  rent_paid_by         text default 'stripe',
  insurance_option     text default 'standard' check (insurance_option in ('standard','reduced')),
  stripe_subscription_id text,
  shopify_ref      text,
  contract_ref     text,
  notes            text,
  price            numeric,
  billing_period   text default 'weekly' check (billing_period in ('weekly','fixed')),
  odometer_return  numeric,
  created_at       timestamptz default now()
);

-- Run this if the tables already exist:
-- alter table rentals add column if not exists price numeric;
-- alter table rentals add column if not exists odometer_return numeric;
-- alter table rentals add column if not exists billing_period text default 'weekly' check (billing_period in ('weekly','fixed'));
-- Finance module (bond statuses, finance_* tables): run supabase/migration_finance.sql

create table if not exists maintenance (
  id                uuid primary key default gen_random_uuid(),
  vehicle_id        uuid references vehicles(id) on delete set null,
  type              text default 'service',
  description       text,
  date              date,
  next_service_date date,
  cost              numeric,
  created_at        timestamptz default now()
);

create table if not exists settings (
  id                 integer primary key default 1,
  owner_company      text default 'Easy Aussie AU Pty Ltd',
  owner_abn          text default '20 680 626 251',
  owner_responsible  text default 'Jonathan Alexander Gonzalez Botero',
  default_bond       text default '300',
  insurance_excess   text default '700',
  ebike_bond            text default '150',
  oil_refill_fee        text default '5',
  reduced_excess        text default '300',
  reduced_excess_weekly text default '10',
  reduced_excess_fixed  text default '30',
  ebike_total_liability text default '600',
  ebike_reduced_weekly  text default '10',
  ebike_reduced_fixed   text default '30'
);

-- Insert the single settings row
insert into settings (id) values (1) on conflict (id) do nothing;

-- ── Row Level Security ────────────────────────────────────────────────────────

alter table vehicles    enable row level security;
alter table customers   enable row level security;
alter table rentals     enable row level security;
alter table maintenance enable row level security;
alter table settings    enable row level security;

-- Authenticated users (you, logged in) can do everything
create policy "Auth full access" on vehicles    for all to authenticated using (true) with check (true);
create policy "Auth full access" on rentals     for all to authenticated using (true) with check (true);
create policy "Auth full access" on maintenance for all to authenticated using (true) with check (true);
create policy "Auth full access" on settings    for all to authenticated using (true) with check (true);

-- Customers: authenticated users have full access
create policy "Auth full access"       on customers for all    to authenticated using (true) with check (true);
-- Anonymous users can only INSERT (for the public intake form)
create policy "Public intake form insert" on customers for insert to anon          with check (true);
create policy "Public read settings"      on settings  for select to anon          using (true);
