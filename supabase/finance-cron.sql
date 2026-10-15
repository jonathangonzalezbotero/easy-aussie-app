-- Finance schedules. Run once in the SQL Editor after deploying the functions.
-- Requires pg_cron and pg_net (Dashboard → Database → Extensions).
-- Replace YOUR_PROJECT_REF and YOUR_ANON_KEY.

-- Stripe sync every day at 6 am Brisbane (20:00 UTC)
select cron.schedule('finance-stripe-sync', '0 20 * * *', $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-sync',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb) as request_id;
$$);

-- Bank CSV reminder on Sunday at 6 pm Brisbane (08:00 UTC)
select cron.schedule('finance-csv-reminder', '0 8 * * 0', $$
  select net.http_post(
    url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-csv-reminder',
    headers := '{"Authorization": "Bearer YOUR_ANON_KEY", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb) as request_id;
$$);

-- Deploy:
--   supabase functions deploy stripe-sync
--   supabase functions deploy send-csv-reminder
--   supabase functions deploy stripe-webhook --no-verify-jwt
-- Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
-- Stripe webhook endpoint: https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
--   events: invoice.payment_failed, invoice.paid, customer.subscription.updated, customer.subscription.deleted
