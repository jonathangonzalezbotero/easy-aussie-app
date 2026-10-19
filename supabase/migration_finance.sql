-- Finance module migration
-- Run this in Supabase → SQL Editor. Safe to re-run.

-- ── 1. Rentals: richer bond model + how rent is paid ─────────────────────────
alter table rentals drop constraint if exists rentals_bond_status_check;
update rentals set bond_status = 'refunded' where bond_status = 'returned';
alter table rentals add constraint rentals_bond_status_check
  check (bond_status in ('awaiting','held','refunded','partially_refunded','retained','transferred'));

alter table rentals add column if not exists bond_refunded_amount  numeric;
alter table rentals add column if not exists bond_retained_amount  numeric;
alter table rentals add column if not exists bond_retain_reason    text;
alter table rentals add column if not exists bond_refund_method    text;
alter table rentals add column if not exists bond_refund_date      date;
alter table rentals add column if not exists rent_paid_by          text default 'stripe';
alter table rentals add column if not exists stripe_subscription_id text;

-- ── 2. Finance tables ────────────────────────────────────────────────────────
create table if not exists finance_accounts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          text not null check (kind in ('bank','processor','personal','cash')),
  feed          text not null check (feed in ('csv','stripe','manual')),
  account_hint  text,               -- last 4 digits of the bank account, used to check a CSV is for this account
  sort_order    int default 0,
  last_import_at timestamptz,
  created_at    timestamptz default now()
);

create table if not exists finance_imports (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid references finance_accounts(id) on delete cascade,
  kind            text not null default 'bank_csv' check (kind in ('bank_csv','spreadsheet','stripe')),
  file_name       text,
  line_count      int default 0,
  new_count       int default 0,
  skipped_count   int default 0,
  from_date       date,
  to_date         date,
  closing_balance numeric,
  created_at      timestamptz default now()
);

create table if not exists finance_transactions (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid references finance_accounts(id) on delete restrict,
  date             date not null,
  amount           numeric not null,          -- signed: money in positive, money out negative
  description      text not null default '',
  balance          numeric,                   -- running balance from the bank file, if any
  source           text not null default 'manual' check (source in ('bank_csv','stripe','spreadsheet','manual')),
  import_id        uuid references finance_imports(id) on delete set null,
  external_id      text,                      -- Stripe object id
  raw              jsonb,                     -- original row
  category         text,
  match_status     text not null default 'unreviewed' check (match_status in ('unreviewed','suggested','confirmed','ignored')),
  suggestion       jsonb,                     -- why the app suggested this category/link
  customer_id      uuid references customers(id) on delete set null,
  rental_id        uuid references rentals(id) on delete set null,
  vehicle_id       uuid references vehicles(id) on delete set null,
  linked_transaction_id uuid references finance_transactions(id) on delete set null,
  notes            text,
  previous_state   jsonb,                     -- snapshot taken before the last confirm, for undo
  confirmed_at     timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  -- duplicate detection for imported lines: same account, date, amount, description and
  -- balance = same line. Null (no conflict) for manual and Stripe lines. Filled by the
  -- trigger below (a generated column is not allowed: date/numeric casts are not immutable).
  dedupe_key       text
);

create or replace function finance_set_dedupe_key() returns trigger language plpgsql as $$
begin
  if new.source in ('bank_csv','spreadsheet') then
    new.dedupe_key := coalesce(new.account_id::text,'') || '|' || to_char(new.date, 'YYYY-MM-DD') || '|' ||
                      trim(to_char(new.amount, 'FM9999999990.99'), '.') || '|' ||
                      lower(trim(new.description)) || '|' ||
                      coalesce(trim(to_char(new.balance, 'FM9999999990.99'), '.'), '');
  else
    new.dedupe_key := null;
  end if;
  return new;
end $$;
drop trigger if exists finance_transactions_dedupe_key on finance_transactions;
create trigger finance_transactions_dedupe_key
  before insert or update of account_id, date, amount, description, balance, source
  on finance_transactions for each row execute function finance_set_dedupe_key();

create unique index if not exists finance_transactions_dedupe on finance_transactions (dedupe_key);
create unique index if not exists finance_transactions_external on finance_transactions (account_id, external_id);
create index if not exists finance_transactions_date on finance_transactions (date desc);

create table if not exists finance_splits (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references finance_transactions(id) on delete cascade,
  category        text not null,
  amount          numeric not null,
  rental_id       uuid references rentals(id) on delete set null,
  customer_id     uuid references customers(id) on delete set null,
  vehicle_id      uuid references vehicles(id) on delete set null,
  notes           text,
  sort_order      int default 0
);

create table if not exists finance_rules (
  id          uuid primary key default gen_random_uuid(),
  pattern     text not null,                 -- "A | B | C" matches any of A, B, C (case-insensitive contains)
  category    text not null,
  account_id  uuid references finance_accounts(id) on delete set null,   -- null = any account
  priority    int default 100,
  active      boolean default true,
  created_at  timestamptz default now()
);

create table if not exists finance_recurring (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null,
  amount      numeric not null,
  frequency   text not null check (frequency in ('weekly','fortnightly','monthly','yearly')),
  next_due    date,
  vehicle_id  uuid references vehicles(id) on delete cascade,
  active      boolean default true,
  created_at  timestamptz default now()
);

create table if not exists finance_forecast_overrides (
  id        uuid primary key default gen_random_uuid(),
  month     date not null,                    -- first day of the month
  category  text not null,
  amount    numeric not null,
  note      text,
  unique (month, category)
);

create table if not exists finance_settings (
  id                          integer primary key default 1,
  cutover_date                date,
  director_loan_opening       numeric default 0,  -- balance owed to the director at opening_date
  director_loan_opening_date  date,
  target_occupancy            numeric default 0.8,
  scooter_weekly_rate         numeric default 135,
  ebike_weekly_rate           numeric default 55,
  reminder_enabled            boolean default true,
  reminder_email              text,
  stripe_last_sync            timestamptz,
  stripe_sync_from            date
);
insert into finance_settings (id) values (1) on conflict (id) do nothing;

-- Stripe subscriptions mirrored for the "past due" alert and rental linking
create table if not exists finance_stripe_subscriptions (
  id              text primary key,         -- sub_...
  customer_email  text,
  customer_name   text,
  amount          numeric,
  interval        text,
  status          text,
  past_due_since  timestamptz,
  last_failed_amount numeric,
  updated_at      timestamptz default now()
);

-- ── 3. Row Level Security ────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['finance_accounts','finance_imports','finance_transactions','finance_splits',
                           'finance_rules','finance_recurring','finance_forecast_overrides','finance_settings',
                           'finance_stripe_subscriptions']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "Auth full access" on %I', t);
    execute format('create policy "Auth full access" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ── 4. Seed accounts ─────────────────────────────────────────────────────────
insert into finance_accounts (name, kind, feed, sort_order)
select * from (values
  ('NAB Business', 'bank', 'csv', 1),
  ('NAB Deposits', 'bank', 'csv', 2),
  ('NAB Rego',     'bank', 'csv', 3),
  ('Stripe',       'processor', 'stripe', 4),
  ('Personal card','personal', 'manual', 5),
  ('Cash',         'cash', 'manual', 6)
) as v(name, kind, feed, sort_order)
where not exists (select 1 from finance_accounts);

-- ── 5. Atomic confirm with undo snapshot ─────────────────────────────────────
-- Applies a transaction update, replaces its splits, and optionally patches the
-- linked rental, in one statement so a failure leaves nothing half-done.
create or replace function finance_confirm(
  p_transaction_id uuid,
  p_updates        jsonb,          -- columns on finance_transactions to set
  p_splits         jsonb,          -- array of {category, amount, rental_id, customer_id, vehicle_id, notes} or null to leave as is
  p_rental_id      uuid,           -- rental to patch, or null
  p_rental_updates jsonb           -- columns on rentals to set, or null
) returns void language plpgsql security definer as $$
declare
  snap jsonb;
  s jsonb;
  i int := 0;
begin
  select jsonb_build_object(
    'transaction', to_jsonb(t) - 'previous_state' - 'dedupe_key',
    'splits', coalesce((select jsonb_agg(to_jsonb(sp)) from finance_splits sp where sp.transaction_id = t.id), '[]'::jsonb),
    'rental', case when p_rental_id is null then null else (select to_jsonb(r) from rentals r where r.id = p_rental_id) end
  ) into snap from finance_transactions t where t.id = p_transaction_id;

  update finance_transactions set
    category     = coalesce(p_updates->>'category', category),
    match_status = coalesce(p_updates->>'match_status', match_status),
    customer_id  = case when p_updates ? 'customer_id' then nullif(p_updates->>'customer_id','')::uuid else customer_id end,
    rental_id    = case when p_updates ? 'rental_id'   then nullif(p_updates->>'rental_id','')::uuid   else rental_id end,
    vehicle_id   = case when p_updates ? 'vehicle_id'  then nullif(p_updates->>'vehicle_id','')::uuid  else vehicle_id end,
    linked_transaction_id = case when p_updates ? 'linked_transaction_id' then nullif(p_updates->>'linked_transaction_id','')::uuid else linked_transaction_id end,
    notes        = case when p_updates ? 'notes' then p_updates->>'notes' else notes end,
    previous_state = snap,
    confirmed_at = case when p_updates->>'match_status' = 'confirmed' then now() else confirmed_at end,
    updated_at   = now()
  where id = p_transaction_id;

  if p_splits is not null then
    delete from finance_splits where transaction_id = p_transaction_id;
    for s in select * from jsonb_array_elements(p_splits) loop
      insert into finance_splits (transaction_id, category, amount, rental_id, customer_id, vehicle_id, notes, sort_order)
      values (p_transaction_id, s->>'category', (s->>'amount')::numeric,
              nullif(s->>'rental_id','')::uuid, nullif(s->>'customer_id','')::uuid, nullif(s->>'vehicle_id','')::uuid,
              s->>'notes', i);
      i := i + 1;
    end loop;
  end if;

  if p_rental_id is not null and p_rental_updates is not null then
    update rentals set
      bond_status          = coalesce(p_rental_updates->>'bond_status', bond_status),
      bond_refunded_amount = case when p_rental_updates ? 'bond_refunded_amount' then (p_rental_updates->>'bond_refunded_amount')::numeric else bond_refunded_amount end,
      bond_retained_amount = case when p_rental_updates ? 'bond_retained_amount' then (p_rental_updates->>'bond_retained_amount')::numeric else bond_retained_amount end,
      bond_retain_reason   = coalesce(p_rental_updates->>'bond_retain_reason', bond_retain_reason),
      bond_refund_method   = coalesce(p_rental_updates->>'bond_refund_method', bond_refund_method),
      bond_refund_date     = case when p_rental_updates ? 'bond_refund_date' then (p_rental_updates->>'bond_refund_date')::date else bond_refund_date end,
      bond_amount          = case when p_rental_updates ? 'bond_amount' then (p_rental_updates->>'bond_amount')::numeric else bond_amount end
    where id = p_rental_id;
  end if;
end $$;

-- Restores the snapshot taken by finance_confirm.
create or replace function finance_undo(p_transaction_id uuid) returns void language plpgsql security definer as $$
declare
  snap jsonb; t jsonb; r jsonb; s jsonb;
begin
  select previous_state into snap from finance_transactions where id = p_transaction_id;
  if snap is null then raise exception 'Nothing to undo'; end if;
  t := snap->'transaction';
  update finance_transactions set
    category = t->>'category', match_status = t->>'match_status',
    customer_id = nullif(t->>'customer_id','')::uuid, rental_id = nullif(t->>'rental_id','')::uuid,
    vehicle_id = nullif(t->>'vehicle_id','')::uuid, linked_transaction_id = nullif(t->>'linked_transaction_id','')::uuid,
    notes = t->>'notes', confirmed_at = nullif(t->>'confirmed_at','')::timestamptz,
    previous_state = null, updated_at = now()
  where id = p_transaction_id;
  delete from finance_splits where transaction_id = p_transaction_id;
  for s in select * from jsonb_array_elements(snap->'splits') loop
    insert into finance_splits (transaction_id, category, amount, rental_id, customer_id, vehicle_id, notes, sort_order)
    values (p_transaction_id, s->>'category', (s->>'amount')::numeric, nullif(s->>'rental_id','')::uuid,
            nullif(s->>'customer_id','')::uuid, nullif(s->>'vehicle_id','')::uuid, s->>'notes', coalesce((s->>'sort_order')::int,0));
  end loop;
  r := snap->'rental';
  if r is not null and r <> 'null'::jsonb then
    update rentals set
      bond_status = r->>'bond_status', bond_amount = nullif(r->>'bond_amount','')::numeric,
      bond_refunded_amount = nullif(r->>'bond_refunded_amount','')::numeric,
      bond_retained_amount = nullif(r->>'bond_retained_amount','')::numeric,
      bond_retain_reason = r->>'bond_retain_reason', bond_refund_method = r->>'bond_refund_method',
      bond_refund_date = nullif(r->>'bond_refund_date','')::date
    where id = (r->>'id')::uuid;
  end if;
end $$;

grant execute on function finance_confirm(uuid, jsonb, jsonb, uuid, jsonb) to authenticated;
grant execute on function finance_undo(uuid) to authenticated;
