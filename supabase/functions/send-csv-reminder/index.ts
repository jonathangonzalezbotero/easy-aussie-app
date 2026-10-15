// Sunday reminder: emails the owner if no NAB Business CSV was imported since Monday.
// Scheduled with pg_cron (see supabase/finance-cron.sql). Secrets: RESEND_API_KEY, RESEND_FROM_EMAIL.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function serviceKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) { try { const p = JSON.parse(raw); const k = p['service_role'] ?? Object.values(p)[0]; if (k) return k as string; } catch { /* ignore */ } }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

serve(async () => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey());
  const { data: s } = await db.from('finance_settings').select('*').eq('id', 1).maybeSingle();
  if (!s?.reminder_enabled || !s.reminder_email) return new Response(JSON.stringify({ skipped: 'reminder off or no email' }), { headers: { 'Content-Type': 'application/json' } });

  const { data: acc } = await db.from('finance_accounts').select('*').eq('name', 'NAB Business').maybeSingle();
  // Monday 00:00 Brisbane (UTC+10, no DST)
  const now = new Date(Date.now() + 10 * 3600 * 1000);
  const day = now.getUTCDay() || 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (day - 1)) - 10 * 3600 * 1000);
  if (acc?.last_import_at && new Date(acc.last_import_at) >= monday) return new Response(JSON.stringify({ skipped: 'csv imported this week' }), { headers: { 'Content-Type': 'application/json' } });

  const { count } = await db.from('finance_transactions').select('id', { count: 'exact', head: true }).in('match_status', ['unreviewed', 'suggested']);
  const last = acc?.last_import_at ? new Date(acc.last_import_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : 'never';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}` },
    body: JSON.stringify({
      from: `Easy Aussie AU <${Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@easyaussie.com.au'}>`,
      to: [s.reminder_email],
      subject: 'Weekly bank CSV not uploaded yet',
      html: `<p>No NAB Business CSV has been imported this week (last import: ${last}).</p><p>Export it from NAB internet banking (Transaction history › Export › CSV) and upload it in Finance › Settings.</p>${count ? `<p>${count} transactions are waiting in the reconcile queue.</p>` : ''}`,
    }),
  });
  const json = await res.json();
  return new Response(JSON.stringify({ sent: res.ok, resend: json }), { status: res.ok ? 200 : 500, headers: { 'Content-Type': 'application/json' } });
});
