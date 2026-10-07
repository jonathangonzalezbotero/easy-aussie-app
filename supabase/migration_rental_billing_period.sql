-- Run this in Supabase → SQL Editor

alter table rentals add column if not exists billing_period text default 'weekly'
  check (billing_period in ('weekly','fixed'));
