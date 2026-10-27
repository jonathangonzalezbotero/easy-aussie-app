-- Date a vehicle left the fleet (stolen or sold), for the FY summary's "Vehicles stolen or sold" table.
-- Run in Supabase → SQL Editor. Safe to re-run.
alter table vehicles add column if not exists left_fleet_on date;
