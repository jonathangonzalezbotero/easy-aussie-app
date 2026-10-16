-- Finance: payees (contractors, suppliers, insurers). Run after migration_finance.sql. Safe to re-run.

create table if not exists finance_payees (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  kind             text not null default 'supplier' check (kind in ('contractor','supplier','insurer','government','other')),
  abn              text,
  default_category text,
  match_text       text,        -- "A | B" found in a bank description attributes the line to this payee
  notes            text,
  active           boolean default true,
  created_at       timestamptz default now()
);
alter table finance_payees enable row level security;
drop policy if exists "Auth full access" on finance_payees;
create policy "Auth full access" on finance_payees for all to authenticated using (true) with check (true);

alter table finance_transactions add column if not exists payee_id uuid references finance_payees(id) on delete set null;
alter table finance_splits       add column if not exists payee_id uuid references finance_payees(id) on delete set null;
alter table finance_rules        add column if not exists payee_id uuid references finance_payees(id) on delete set null;
create index if not exists finance_transactions_payee on finance_transactions (payee_id);

-- finance_confirm / finance_undo now carry payee_id
create or replace function finance_confirm(
  p_transaction_id uuid, p_updates jsonb, p_splits jsonb, p_rental_id uuid, p_rental_updates jsonb
) returns void language plpgsql security definer as $$
declare
  snap jsonb; s jsonb; i int := 0;
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
    payee_id     = case when p_updates ? 'payee_id'    then nullif(p_updates->>'payee_id','')::uuid    else payee_id end,
    linked_transaction_id = case when p_updates ? 'linked_transaction_id' then nullif(p_updates->>'linked_transaction_id','')::uuid else linked_transaction_id end,
    notes        = case when p_updates ? 'notes' then p_updates->>'notes' else notes end,
    previous_state = snap,
    confirmed_at = case when p_updates->>'match_status' = 'confirmed' then now() else confirmed_at end,
    updated_at   = now()
  where id = p_transaction_id;

  if p_splits is not null then
    delete from finance_splits where transaction_id = p_transaction_id;
    for s in select * from jsonb_array_elements(p_splits) loop
      insert into finance_splits (transaction_id, category, amount, rental_id, customer_id, vehicle_id, payee_id, notes, sort_order)
      values (p_transaction_id, s->>'category', (s->>'amount')::numeric,
              nullif(s->>'rental_id','')::uuid, nullif(s->>'customer_id','')::uuid, nullif(s->>'vehicle_id','')::uuid,
              nullif(s->>'payee_id','')::uuid, s->>'notes', i);
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
    vehicle_id = nullif(t->>'vehicle_id','')::uuid, payee_id = nullif(t->>'payee_id','')::uuid,
    linked_transaction_id = nullif(t->>'linked_transaction_id','')::uuid,
    notes = t->>'notes', confirmed_at = nullif(t->>'confirmed_at','')::timestamptz,
    previous_state = null, updated_at = now()
  where id = p_transaction_id;
  delete from finance_splits where transaction_id = p_transaction_id;
  for s in select * from jsonb_array_elements(snap->'splits') loop
    insert into finance_splits (transaction_id, category, amount, rental_id, customer_id, vehicle_id, payee_id, notes, sort_order)
    values (p_transaction_id, s->>'category', (s->>'amount')::numeric, nullif(s->>'rental_id','')::uuid,
            nullif(s->>'customer_id','')::uuid, nullif(s->>'vehicle_id','')::uuid, nullif(s->>'payee_id','')::uuid, s->>'notes', coalesce((s->>'sort_order')::int,0));
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
