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
