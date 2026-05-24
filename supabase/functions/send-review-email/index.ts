import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_REVIEW_URL = 'https://g.page/r/CSEszNNgLgTvEBM/review';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { customer_email, customer_name } = await req.json();
    if (!customer_email) {
      return new Response(JSON.stringify({ error: 'customer_email is required' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

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
            <p style="margin:6px 0 0;font-size:13px;color:rgba(255,255,255,0.8);">Thanks for riding with us!</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 16px;font-size:16px;color:#1a1a1a;">Hey ${firstName}! 👋</p>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#444;">
              Thanks so much for renting with <strong>Easy Aussie AU</strong> — we hope you had a great experience
              and enjoyed the ride!
            </p>
            <p style="margin:0 0 24px;font-size:14px;line-height:1.7;color:#444;">
              It would mean the world to us if you could spare 60 seconds to leave a quick Google review.
              It helps other travellers find us and keeps the business rolling. 🙏
            </p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
              <tr>
                <td style="background:#2d8a5a;border-radius:8px;">
                  <a href="${GOOGLE_REVIEW_URL}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:white;text-decoration:none;">
                    Leave a Google Review ⭐
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#444;">
              If anything could have been better, please text me directly on <strong>0476 474 172</strong>
              — I read every message personally.
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

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Easy Aussie AU <${Deno.env.get('RESEND_FROM_EMAIL') || 'noreply@easyaussie.com.au'}>`,
        to: customer_email,
        subject: 'Thanks for riding with Easy Aussie AU — leave us a review? ⭐',
        html,
      }),
    });

    if (!emailRes.ok) {
      const body = await emailRes.text();
      throw new Error(`Resend error: ${body}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
