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
    const token = new URL(req.url).searchParams.get('token');
    if (!token) {
      return new Response(JSON.stringify({ error: 'token is required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      getServiceRoleKey(),
    );

    const { data: sigReq, error: sigErr } = await supabase
      .from('signing_requests')
      .select('*')
      .eq('token', token)
      .single();

    if (sigErr || !sigReq) {
      return new Response(JSON.stringify({ error: 'Invalid signing link' }), { status: 404, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (new Date(sigReq.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This signing link has expired' }), { status: 410, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const [rentalRes, settingsRes] = await Promise.all([
      supabase.from('rentals').select('*, customers(*), vehicles(*)').eq('id', sigReq.rental_id).single(),
      supabase.from('settings').select('*').eq('id', 1).single(),
    ]);

    if (rentalRes.error) throw rentalRes.error;

    return new Response(
      JSON.stringify({ signingRequest: sigReq, rental: rentalRes.data, settings: settingsRes.data }),
      { headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
