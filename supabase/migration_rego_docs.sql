-- Run this in Supabase → SQL Editor

-- 1. Add rego document path column to vehicles
alter table vehicles add column if not exists rego_doc_path text;

-- 2. Create the storage bucket (private — signed URLs used for downloads)
insert into storage.buckets (id, name, public)
values ('vehicle-docs', 'vehicle-docs', false)
on conflict (id) do nothing;

-- 3. Storage RLS — authenticated users only
create policy "Auth upload vehicle docs"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'vehicle-docs');

create policy "Auth read vehicle docs"
  on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-docs');

create policy "Auth delete vehicle docs"
  on storage.objects for delete to authenticated
  using (bucket_id = 'vehicle-docs');

create policy "Auth update vehicle docs"
  on storage.objects for update to authenticated
  using (bucket_id = 'vehicle-docs');
