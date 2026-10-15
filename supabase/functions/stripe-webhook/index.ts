// Stripe webhook: keeps finance_stripe_subscriptions current for failed and recovered
// subscription payments. Secrets: STRIPE_WEBHOOK_SECRET.
// Deploy with --no-verify-jwt (Stripe cannot send a Supabase token); the signature check
// below is the authentication.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function serviceKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) { try { const p = JSON.parse(raw); const k = p['service_role'] ?? Object.values(p)[0]; if (k) return k as string; } catch { /* ignore */ } }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

async function verify(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=') as [string, string]));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex === v1;
}

serve(async (req) => {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return new Response('STRIPE_WEBHOOK_SECRET not set', { status: 500 });
  const payload = await req.text();
  const sig = req.headers.get('stripe-signature') || '';
  if (!(await verify(payload, sig, secret))) return new Response('Bad signature', { status: 400 });
  const event = JSON.parse(payload);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey());
  const obj = event.data?.object || {};
  const now = new Date().toISOString();

  if (event.type === 'invoice.payment_failed' && obj.subscription) {
    await db.from('finance_stripe_subscriptions').upsert({ id: obj.subscription, customer_email: obj.customer_email || null, customer_name: obj.customer_name || null, amount: (obj.amount_due || 0) / 100, status: 'past_due', past_due_since: now, last_failed_amount: (obj.amount_due || 0) / 100, updated_at: now });
  } else if ((event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') && obj.subscription) {
    await db.from('finance_stripe_subscriptions').upsert({ id: obj.subscription, customer_email: obj.customer_email || null, customer_name: obj.customer_name || null, amount: (obj.amount_paid || 0) / 100, status: 'active', past_due_since: null, last_failed_amount: null, updated_at: now });
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const price = obj.items?.data?.[0]?.price;
    await db.from('finance_stripe_subscriptions').upsert({ id: obj.id, status: obj.status, amount: price ? (price.unit_amount || 0) / 100 : null, interval: price?.recurring?.interval || null, past_due_since: obj.status === 'past_due' ? now : null, updated_at: now });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});
