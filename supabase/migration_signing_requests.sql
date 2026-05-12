-- Signing requests for e-signature workflow
create table if not exists signing_requests (
  id          uuid primary key default gen_random_uuid(),
  rental_id   uuid not null references rentals(id) on delete cascade,
  token       uuid unique not null default gen_random_uuid(),
  status      text not null default 'pending' check (status in ('pending', 'signed')),
  signer_name text,
  signer_ip   text,
  signed_at   timestamptz,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '7 days')
);

alter table signing_requests enable row level security;

-- Authenticated users (owner) have full access
create policy "Auth full access" on signing_requests
  for all to authenticated using (true) with check (true);

-- No direct anon access — public signing page goes through edge functions (service role)
