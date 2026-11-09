-- Hard-deleted imported transactions stay deleted.
-- Not an archive: only the keys needed to recognise a deleted line are kept (bank/spreadsheet
-- dedupe key, or account + Stripe id). A trigger silently skips any later insert of the same line,
-- since Stripe sync re-fetches from a fixed start date and CSV exports can overlap.
-- Run in Supabase → SQL Editor. Safe to re-run.

create table if not exists finance_deleted_transactions (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid,
  dedupe_key  text,
  external_id text
);
create unique index if not exists finance_deleted_dedupe on finance_deleted_transactions (dedupe_key) where dedupe_key is not null;
create unique index if not exists finance_deleted_external on finance_deleted_transactions (account_id, external_id) where external_id is not null;

alter table finance_deleted_transactions enable row level security;
drop policy if exists "Auth full access" on finance_deleted_transactions;
create policy "Auth full access" on finance_deleted_transactions for all to authenticated using (true) with check (true);

-- Remember imported lines when they are deleted (manual lines have neither key and are not recorded).
create or replace function finance_remember_deleted() returns trigger language plpgsql security definer as $$
begin
  if old.dedupe_key is not null or old.external_id is not null then
    insert into finance_deleted_transactions (account_id, dedupe_key, external_id)
    values (old.account_id, old.dedupe_key, old.external_id)
    on conflict do nothing;
  end if;
  return old;
end $$;
drop trigger if exists finance_transactions_remember_deleted on finance_transactions;
create trigger finance_transactions_remember_deleted
  after delete on finance_transactions for each row execute function finance_remember_deleted();

-- Skip inserts of deleted lines. Named so it fires after finance_transactions_dedupe_key
-- (before-insert triggers run in name order), so new.dedupe_key is already filled.
create or replace function finance_skip_deleted() returns trigger language plpgsql security definer as $$
begin
  if new.dedupe_key is not null and exists (select 1 from finance_deleted_transactions d where d.dedupe_key = new.dedupe_key) then
    return null;
  end if;
  if new.external_id is not null and exists (select 1 from finance_deleted_transactions d where d.account_id is not distinct from new.account_id and d.external_id = new.external_id) then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists finance_transactions_skip_deleted on finance_transactions;
create trigger finance_transactions_skip_deleted
  before insert on finance_transactions for each row execute function finance_skip_deleted();
