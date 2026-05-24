-- ============================================================
-- Oil Reminder Cron Setup
-- Run this once in the Supabase SQL Editor.
-- Requires pg_cron and pg_net to be enabled:
--   Dashboard → Database → Extensions → enable pg_cron and pg_net
-- ============================================================

-- Replace the two placeholders below before running:
--   YOUR_PROJECT_REF  → your Supabase project ref (e.g. abcdefghijkl)
--   YOUR_ANON_KEY     → VITE_SUPABASE_ANON_KEY from your .env file

-- Runs daily at 9 AM AEST (23:00 UTC — Queensland, no DST)
select cron.schedule(
  'oil-reminders-daily',
  '0 23 * * *',
  $$
  select net.http_post(
    url        := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-oil-reminders',
    headers    := '{"Authorization": "Bearer YOUR_ANON_KEY", "Content-Type": "application/json"}'::jsonb,
    body       := '{}'::jsonb
  ) as request_id;
  $$
);

-- To verify the job was created:
-- select * from cron.job;

-- To remove the job if needed:
-- select cron.unschedule('oil-reminders-daily');
