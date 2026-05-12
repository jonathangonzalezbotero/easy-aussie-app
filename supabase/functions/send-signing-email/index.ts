import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// SUPABASE_SECRET_KEYS is a JSON dict {"service_role":"eyJ..."} (new Supabase format).
// Falls back to the deprecated SUPABASE_SERVICE_ROLE_KEY env var.
function getServiceRoleKey(): string {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const key = parsed['service_role'] ?? Object.values(parsed)[0];
      if (key) return key as string;
    } catch { /* fall through */ }
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { rental_id, customer_email, customer_name } = await req.json();
    if (!rental_id || !customer_email) {
      return new Response(JSON.stringify({ error: 'rental_id and customer_email are required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      getServiceRoleKey(),
    );

    const { data: sigReq, error } = await supabase
      .from('signing_requests')
      .insert({ rental_id })
      .select()
      .single();

    if (error) throw error;

    const signingUrl = `https://app.easyaussie.com.au/sign/${sigReq.token}`;
    const firstName = customer_name?.split(' ')[0] || 'there';

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f4f0;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#2d8a5a;padding:28px 40px;">
            <p style="margin:0;font-size:20px;font-weight:700;color:white;">Easy Aussie AU</p>
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Rental Agreement · Action Required</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hi ${firstName},</p>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#444;">
              Your rental agreement with <strong>Easy Aussie AU Pty Ltd</strong> is ready for your review and signature.
              Please click the button below to read the full contract and sign it electronically.
            </p>
            <p style="margin:0 0 28px;font-size:14px;line-height:1.7;color:#444;">
              Your electronic signature (typed name) is legally binding under the Australian
              <em>Electronic Transactions Act 1999</em>.
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td style="background:#2d8a5a;border-radius:8px;">
                  <a href="${signingUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:white;text-decoration:none;">
                    Review &amp; Sign Contract →
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 8px;font-size:13px;color:#888;">This link expires in 7 days. If you have any questions, please contact us directly.</p>
            <p style="margin:0;font-size:12px;color:#bbb;word-break:break-all;">Or copy this link: ${signingUrl}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #eee;">
            <p style="margin:0;font-size:12px;color:#aaa;">Easy Aussie AU Pty Ltd · ABN 20 680 626 251 · Queensland, Australia</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Easy Aussie AU <${Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@easyaussie.com.au'}>`,
        to: customer_email,
        subject: 'Your rental agreement is ready to sign — Easy Aussie AU',
        html,
      }),
    });

    if (!emailRes.ok) {
      const body = await emailRes.text();
      throw new Error(`Resend error: ${body}`);
    }

    return new Response(
      JSON.stringify({ success: true, token: sigReq.token }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
