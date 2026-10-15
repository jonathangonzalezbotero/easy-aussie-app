// Pulls Stripe charges, refunds and subscriptions into finance_transactions /
// finance_stripe_subscriptions. Called from the app (Sync now) and from pg_cron.
// Secrets: STRIPE_SECRET_KEY. Uses the service role to write.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function serviceKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) { try { const p = JSON.parse(raw); const k = p['service_role'] ?? Object.values(p)[0]; if (k) return k as string; } catch { /* ignore */ } }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

const STRIPE = 'https://api.stripe.com/v1';
async function stripeList(path: string, params: Record<string, string>, key: string) {
  const out: any[] = [];
  let starting_after: string | undefined;
  for (;;) {
    const qs = new URLSearchParams({ limit: '100', ...params });
    if (starting_after) qs.set('starting_after', starting_after);
    const res = await fetch(`${STRIPE}/${path}?${qs}`, { headers: { Authorization: `Bearer ${key}` } });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || `Stripe ${path} failed`);
    out.push(...json.data);
    if (!json.has_more || !json.data.length) break;
    starting_after = json.data[json.data.length - 1].id;
  }
  return out;
}

const isoDate = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not set');
    const url = Deno.env.get('SUPABASE_URL')!;
    const db = createClient(url, serviceKey());

    // Caller must be a logged-in user, or the cron job using the anon / publishable key.
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '') || '';
    const anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const publishable: string[] = (() => { try { return Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')) as string[]; } catch { return []; } })();
    // The gateway has already verified the JWT signature (verify_jwt is on), so the role claim can be trusted.
    const role = (() => { try { return JSON.parse(atob(auth.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch { return null; } })();
    if (auth !== anon && !publishable.includes(auth) && role !== 'anon') {
      const { data: { user }, error } = await createClient(url, anon).auth.getUser(auth);
      if (error || !user) return new Response(JSON.stringify({ error: 'Not authorised' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { data: settings } = await db.from('finance_settings').select('*').eq('id', 1).maybeSingle();
    const { data: account } = await db.from('finance_accounts').select('*').eq('feed', 'stripe').limit(1).maybeSingle();
    if (!account) throw new Error('No Stripe account row in finance_accounts');
    const fromDate = settings?.stripe_sync_from || (settings?.cutover_date ? isoDate(new Date(settings.cutover_date).getTime() / 1000 + 86400) : null);
    const since = fromDate ? Math.floor(new Date(fromDate + 'T00:00:00Z').getTime() / 1000) : Math.floor(Date.now() / 1000) - 90 * 86400;

    const { data: customers } = await db.from('customers').select('id, name, email');
    const { data: rentals } = await db.from('rentals').select('id, customer_id, vehicle_id, status, start_date, stripe_subscription_id');
    const byEmail = (email?: string | null) => email ? customers?.find(c => (c.email || '').toLowerCase() === email.toLowerCase()) : null;
    const rentalFor = (customerId?: string | null, subId?: string | null) =>
      rentals?.find(r => subId && r.stripe_subscription_id === subId) ||
      rentals?.filter(r => r.customer_id === customerId && r.status === 'active').sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0] ||
      rentals?.filter(r => r.customer_id === customerId).sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))[0];

    const rows: any[] = [];
    const charges = await stripeList('charges', { 'created[gte]': String(since), 'expand[]': 'data.balance_transaction' }, stripeKey);
    for (const ch of charges) {
      if (!ch.paid || ch.status !== 'succeeded') continue;
      const email = ch.billing_details?.email || ch.receipt_email || null;
      const name = ch.billing_details?.name || email || 'Stripe customer';
      const customer = byEmail(email);
      const rental = rentalFor(customer?.id, null);  // subscriptions are linked to rentals in the pass below
      const date = isoDate(ch.created);
      rows.push({ account_id: account.id, date, amount: ch.amount_captured / 100, description: `Stripe charge · ${name}`, source: 'stripe', external_id: ch.id, raw: { id: ch.id, email, invoice: ch.invoice, customer: ch.customer }, category: 'rental_income', match_status: customer ? 'confirmed' : 'unreviewed', customer_id: customer?.id || null, rental_id: rental?.id || null, vehicle_id: rental?.vehicle_id || null, confirmed_at: customer ? new Date().toISOString() : null });
      const fee = ch.balance_transaction?.fee;
      if (fee) rows.push({ account_id: account.id, date, amount: -fee / 100, description: `Stripe fees · ${name}`, source: 'stripe', external_id: `${ch.id}_fee`, raw: { charge: ch.id }, category: 'software_fees', match_status: 'confirmed', customer_id: customer?.id || null, rental_id: rental?.id || null, confirmed_at: new Date().toISOString() });
      if (ch.amount_refunded) rows.push({ account_id: account.id, date: isoDate(ch.refunds?.data?.[0]?.created || ch.created), amount: -ch.amount_refunded / 100, description: `Stripe refund · ${name}`, source: 'stripe', external_id: `${ch.id}_refund`, raw: { charge: ch.id }, category: 'rental_income', match_status: 'unreviewed', customer_id: customer?.id || null, rental_id: rental?.id || null });
    }
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error } = await db.from('finance_transactions').upsert(rows.slice(i, i + 200), { onConflict: 'account_id,external_id', ignoreDuplicates: true }).select('id');
      if (error) throw error;
      inserted += data?.length || 0;
    }

    // Subscriptions mirror (for the past-due alert and rental linking)
    const subs = await stripeList('subscriptions', { status: 'all', 'expand[]': 'data.customer' }, stripeKey);
    const subRows = subs.filter(s => ['active', 'past_due', 'unpaid', 'trialing', 'canceled'].includes(s.status)).map(s => {
      const item = s.items?.data?.[0]; const price = item?.price;
      return { id: s.id, customer_email: s.customer?.email || null, customer_name: s.customer?.name || null, amount: price ? (price.unit_amount || 0) / 100 : null, interval: price?.recurring?.interval || null, status: s.status, past_due_since: s.status === 'past_due' ? new Date(s.current_period_start * 1000).toISOString() : null, updated_at: new Date().toISOString() };
    });
    if (subRows.length) { const { error } = await db.from('finance_stripe_subscriptions').upsert(subRows); if (error) throw error; }
    // Link subscriptions to rentals by customer email when not set
    for (const s of subs) {
      const customer = byEmail(s.customer?.email);
      if (!customer) continue;
      const r = rentals?.find(r => r.customer_id === customer.id && r.status === 'active' && !r.stripe_subscription_id);
      if (r) await db.from('rentals').update({ stripe_subscription_id: s.id }).eq('id', r.id);
    }

    await db.from('finance_settings').upsert({ id: 1, stripe_last_sync: new Date().toISOString() });
    await db.from('finance_accounts').update({ last_import_at: new Date().toISOString() }).eq('id', account.id);
    return new Response(JSON.stringify({ ok: true, charges: charges.length, inserted, subscriptions: subRows.length }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
