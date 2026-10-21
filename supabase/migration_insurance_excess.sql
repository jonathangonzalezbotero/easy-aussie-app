-- Run this in Supabase → SQL Editor
-- Standard insurance excess per claim, shown in the rental contract (section 3.3).

alter table settings add column if not exists insurance_excess text default '700';
update settings set insurance_excess = '700' where id = 1 and insurance_excess is null;
