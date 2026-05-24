import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function vehicleLabel(type: string) {
  if (type === 'ebike') return 'e-bike';
  if (type === 'car') return 'car';
  return 'scooter';
}
function vehicleEmoji(type: string) {
  if (type === 'ebike') return '⚡';
  if (type === 'car') return '🚗';
  return '🛵';
}
function vehicleSubtitle(type: string) {
  if (type === 'ebike') return 'E-bike Rental · Welcome';
  if (type === 'car') return 'Car Rental · Welcome';
  return 'Scooter Rental · Welcome';
}
function vehicleTips(type: string) {
  if (type === 'ebike') return `
              <ul style="margin:0;padding-left:18px;font-size:13px;color:#555;line-height:1.8;">
                <li>Charge the battery fully before your first ride</li>
                <li>Keep tyre pressure between 40–65 PSI (check the sidewall)</li>
                <li>Lock the e-bike whenever you leave it unattended</li>
                <li>Park in designated bicycle areas to avoid fines</li>
                <li>Avoid riding in heavy rain where possible</li>
              </ul>`;
  if (type === 'car') return `
              <ul style="margin:0;padding-left:18px;font-size:13px;color:#555;line-height:1.8;">
                <li>Check fuel level before each trip</li>
                <li>Park only in legal bays — check signs carefully</li>
                <li>Lock the car and close all windows when parked</li>
                <li>Report any damage or issues immediately</li>
              </ul>`;
  return `
              <ul style="margin:0;padding-left:18px;font-size:13px;color:#555;line-height:1.8;">
                <li>Top up engine oil every 2 weeks (bottle provided in the storage box)</li>
                <li>Check tyre pressure regularly — aim for 30–32 PSI</li>
                <li>See the attached parking guide to avoid fines</li>
                <li>Lock the scooter and always use the brake lock when parked</li>
                <li>Text Jonathan on 0476 474 172 if anything feels off</li>
              </ul>`;
}

async function sendWelcomeEmail(supabase: ReturnType<typeof createClient>, rentalId: string) {
  const { data: rental } = await supabase
    .from('rentals').select('customer_id, vehicle_id').eq('id', rentalId).single();
  if (!rental) return;

  const [{ data: customer }, { data: vehicle }] = await Promise.all([
    supabase.from('customers').select('name, email').eq('id', rental.customer_id).single(),
    supabase.from('vehicles').select('type').eq('id', rental.vehicle_id).single(),
  ]);
  if (!customer?.email) return;

  const type = vehicle?.type || 'scooter';
  const firstName = customer.name?.split(' ')[0] || 'there';
  const label = vehicleLabel(type);
  const emoji = vehicleEmoji(type);

  const attachments: Array<{ filename: string; content: string }> = [];
  if (type === 'scooter') {
    const pdfUrl = Deno.env.get('WELCOME_PDF_URL');
    if (pdfUrl) {
      const pdfRes = await fetch(pdfUrl);
      if (pdfRes.ok) {
        const buffer = await pdfRes.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        attachments.push({ filename: 'Scooter-Parking-Guide.pdf', content: base64 });
      }
    }
  }

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
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">${vehicleSubtitle(type)}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hey ${firstName}! ${emoji}</p>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#444;">
              Welcome aboard — stoked to have you riding with <strong>Easy Aussie AU</strong>!
              Your ${label} rental is all set and ready to go.
            </p>
            ${type === 'scooter' && attachments.length > 0 ? `
            <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#444;">
              I've attached a <strong>parking guide</strong> with images showing where and how to park the scooter correctly
              so you don't get a fine. Worth a quick look before your first park.
            </p>` : ''}
            <div style="background:#f5f4f0;border-radius:10px;padding:18px 20px;margin:0 0 24px;">
              <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#1a1a1a;">Quick reminders:</p>
              ${vehicleTips(type)}
            </div>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#444;">
              Any questions? Text Jonathan directly on <strong>0476 474 172</strong>.
            </p>
            <p style="margin:0;font-size:14px;line-height:1.7;color:#444;">Cheers,<br><strong>Jonathan</strong><br>Easy Aussie AU</p>
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

  const payload: Record<string, unknown> = {
    from: `Easy Aussie AU <${Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@easyaussie.com.au'}>`,
    to: customer.email,
    subject: `Welcome to Easy Aussie AU — your ${label} is ready ${emoji}`,
    html,
  };
  if (attachments.length > 0) payload.attachments = attachments;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { token, signer_name } = await req.json();
    if (!token || !signer_name?.trim()) {
      return new Response(JSON.stringify({ error: 'token and signer_name are required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      getServiceRoleKey(),
    );

    const { data: sigReq, error: fetchErr } = await supabase
      .from('signing_requests')
      .select('*')
      .eq('token', token)
      .single();

    if (fetchErr || !sigReq) {
      return new Response(JSON.stringify({ error: 'Invalid signing link' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (new Date(sigReq.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This signing link has expired' }), { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (sigReq.status === 'signed') {
      return new Response(JSON.stringify({ error: 'This contract has already been signed' }), { status: 409, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const signer_ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('x-real-ip')
      || 'unknown';

    const signed_at = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('signing_requests')
      .update({ status: 'signed', signer_name: signer_name.trim(), signer_ip, signed_at })
      .eq('token', token);

    if (updateErr) throw updateErr;

    // Fire welcome email after successful signing (fire-and-forget, don't fail the response)
    sendWelcomeEmail(supabase, sigReq.rental_id).catch(() => {});

    return new Response(
      JSON.stringify({ success: true, signed_at }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
