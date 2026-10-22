-- Intake terms acceptance + insurance option + configurable surcharges.
-- Run in the Supabase SQL Editor.

alter table customers add column if not exists terms_accepted_at timestamptz;
alter table customers add column if not exists terms_version     text;
alter table customers add column if not exists insurance_option  text check (insurance_option in ('standard','reduced'));

alter table rentals add column if not exists insurance_option text default 'standard' check (insurance_option in ('standard','reduced'));

alter table settings add column if not exists ebike_bond            text default '150';
alter table settings add column if not exists oil_refill_fee        text default '5';
alter table settings add column if not exists reduced_excess        text default '300';
alter table settings add column if not exists reduced_excess_weekly text default '10';
-- If the column was created by an earlier run with the old $5 default:
update settings set reduced_excess_weekly = '10' where id = 1 and reduced_excess_weekly = '5';
alter table settings add column if not exists reduced_excess_fixed  text default '30';

-- The public intake page shows the rental conditions (bond, excess, surcharges) before
-- the form, so it needs to read the single settings row. Everything in this table is
-- already printed on customer-facing contracts.
drop policy if exists "Public read settings" on settings;
create policy "Public read settings" on settings for select to anon using (true);
