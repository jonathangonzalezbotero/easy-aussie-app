-- Odometer log: one dated reading per event, and the vehicle's current odometer derived from it.
-- Run this in Supabase → SQL Editor. Safe to run more than once.
--
-- Sources of readings:
--   rental_start   rentals.odometer          dated rentals.start_date
--   rental_return  rentals.odometer_return   dated rentals.end_date (or start_date)
--   service        maintenance.odometer      dated maintenance.date
--   manual         typed in the vehicle drawer ("Record reading")
--
-- Triggers on rentals and maintenance keep their readings in step with the row (insert, edit, delete).
-- A trigger on the log sets vehicles.odometer / odometer_at / odometer_source to the reading with the
-- latest date (highest km on a tie). The app never writes vehicles.odometer directly any more.

create table if not exists odometer_readings (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references vehicles(id) on delete cascade,
  reading     numeric not null check (reading >= 0),
  read_at     date not null,
  source      text not null check (source in ('rental_start', 'rental_return', 'service', 'manual')),
  source_id   uuid,
  note        text,
  created_at  timestamptz default now()
);

create unique index if not exists odometer_readings_source_key
  on odometer_readings (source, source_id) where source_id is not null;
create index if not exists odometer_readings_vehicle_idx
  on odometer_readings (vehicle_id, read_at desc);

alter table odometer_readings enable row level security;
drop policy if exists "Auth full access" on odometer_readings;
create policy "Auth full access" on odometer_readings for all to authenticated using (true) with check (true);

alter table vehicles add column if not exists odometer_at date;
alter table vehicles add column if not exists odometer_source text;

-- ── Derive the vehicle's current odometer ───────────────────────────────────

create or replace function odometer_recompute(vid uuid) returns void language plpgsql as $$
begin
  update vehicles v set
    odometer        = r.reading,
    odometer_at     = r.read_at,
    odometer_source = r.source
  from (
    select reading, read_at, source from odometer_readings
    where vehicle_id = vid
    order by read_at desc, reading desc, created_at desc
    limit 1
  ) r
  where v.id = vid;

  update vehicles set odometer = null, odometer_at = null, odometer_source = null
  where id = vid and not exists (select 1 from odometer_readings where vehicle_id = vid);
end $$;

create or replace function odometer_readings_changed() returns trigger language plpgsql as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform odometer_recompute(old.vehicle_id); end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.vehicle_id is distinct from old.vehicle_id) then
    perform odometer_recompute(new.vehicle_id);
  end if;
  return null;
end $$;

drop trigger if exists odometer_readings_changed on odometer_readings;
create trigger odometer_readings_changed
  after insert or update or delete on odometer_readings
  for each row execute function odometer_readings_changed();

-- ── Keep rental and service readings in step with their rows ───────────────

create or replace function odometer_sync_reading(p_source text, p_source_id uuid, p_vehicle uuid, p_reading numeric, p_date date) returns void language plpgsql as $$
begin
  if p_vehicle is null or p_reading is null or p_date is null then
    delete from odometer_readings where source = p_source and source_id = p_source_id;
  else
    insert into odometer_readings (vehicle_id, reading, read_at, source, source_id)
    values (p_vehicle, p_reading, p_date, p_source, p_source_id)
    on conflict (source, source_id) where source_id is not null
    do update set vehicle_id = excluded.vehicle_id, reading = excluded.reading, read_at = excluded.read_at;
  end if;
end $$;

create or replace function rentals_sync_odometer() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    delete from odometer_readings where source in ('rental_start', 'rental_return') and source_id = old.id;
    return null;
  end if;
  perform odometer_sync_reading('rental_start',  new.id, new.vehicle_id, new.odometer,        new.start_date);
  perform odometer_sync_reading('rental_return', new.id, new.vehicle_id, new.odometer_return, coalesce(new.end_date, new.start_date));
  return null;
end $$;

drop trigger if exists rentals_sync_odometer on rentals;
create trigger rentals_sync_odometer
  after insert or update or delete on rentals
  for each row execute function rentals_sync_odometer();

create or replace function maintenance_sync_odometer() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    delete from odometer_readings where source = 'service' and source_id = old.id;
    return null;
  end if;
  perform odometer_sync_reading('service', new.id, new.vehicle_id, new.odometer, new.date);
  return null;
end $$;

drop trigger if exists maintenance_sync_odometer on maintenance;
create trigger maintenance_sync_odometer
  after insert or update or delete on maintenance
  for each row execute function maintenance_sync_odometer();

-- ── Backfill from the existing columns ─────────────────────────────────────

-- A vehicle whose typed figure is higher than every dated reading keeps it as a manual reading
-- dated today, flagged for review, so nothing already recorded is lost. Runs before the log is
-- filled (the log would overwrite the typed figure) and only on the first run (odometer_at is
-- still null then).
insert into odometer_readings (vehicle_id, reading, read_at, source, note)
select v.id, v.odometer, current_date, 'manual', 'Before the odometer log. Date of this reading is unknown; review it.'
from vehicles v
where v.odometer is not null and v.odometer_at is null
  and v.odometer > coalesce((
    select max(km) from (
      select odometer as km from rentals where vehicle_id = v.id
      union all select odometer_return from rentals where vehicle_id = v.id
      union all select odometer from maintenance where vehicle_id = v.id
    ) k where km is not null), -1)
  and not exists (select 1 from odometer_readings r where r.vehicle_id = v.id and r.source = 'manual' and r.note like 'Before the odometer log%');

do $$
declare r record;
begin
  for r in select id, vehicle_id, odometer, odometer_return, start_date, end_date from rentals loop
    perform odometer_sync_reading('rental_start',  r.id, r.vehicle_id, r.odometer,        r.start_date);
    perform odometer_sync_reading('rental_return', r.id, r.vehicle_id, r.odometer_return, coalesce(r.end_date, r.start_date));
  end loop;
  for r in select id, vehicle_id, odometer, date from maintenance loop
    perform odometer_sync_reading('service', r.id, r.vehicle_id, r.odometer, r.date);
  end loop;
end $$;

-- Recompute every vehicle so the cached figure matches the log.
do $$
declare v record;
begin
  for v in select id from vehicles loop perform odometer_recompute(v.id); end loop;
end $$;
