-- Run this in Supabase → SQL Editor

create table if not exists rego_renewals (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid references vehicles(id) on delete cascade,
  renewal_date date not null,
  expiry_date  date not null,
  duration     text not null,
  cost         numeric,
  notes        text,
  created_at   timestamptz default now()
);

alter table rego_renewals enable row level security;

create policy "Auth full access" on rego_renewals
  for all to authenticated using (true) with check (true);
