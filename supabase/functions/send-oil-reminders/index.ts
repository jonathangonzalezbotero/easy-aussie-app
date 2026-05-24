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

// Convert Australian local number (04XXXXXXXX) to E.164 (+614XXXXXXXX)
function normalizeAusPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('61') && digits.length === 11) return '+' + digits;
  if (digits.startsWith('0') && digits.length === 10) return '+61' + digits.slice(1);
  if (digits.length === 9) return '+61' + digits; // already stripped leading 0
  return null;
}

async function sendSms(to: string, body: string): Promise<void> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID')!;
  const token = Deno.env.get('TWILIO_AUTH_TOKEN')!;
  const from = Deno.env.get('TWILIO_FROM_NUMBER')!;

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${sid}:${token}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio error for ${to}: ${text}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      getServiceRoleKey(),
    );

    // Fetch all active rentals with their vehicle and customer
    const { data: rentals, error: rentalErr } = await supabase
      .from('rentals')
      .select('id, start_date, vehicle_id, customer_id')
      .eq('status', 'active');

    if (rentalErr) throw rentalErr;
    if (!rentals?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped: 'no active rentals' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Fetch all vehicles to filter scooters
    const vehicleIds = [...new Set(rentals.map(r => r.vehicle_id))];
    const { data: vehicles, error: vErr } = await supabase
      .from('vehicles')
      .select('id, type')
      .in('id', vehicleIds);
    if (vErr) throw vErr;

    const scooterVehicleIds = new Set(
      (vehicles || []).filter(v => v.type === 'scooter').map(v => v.id),
    );

    const scooterRentals = rentals.filter(r => scooterVehicleIds.has(r.vehicle_id));
    if (!scooterRentals.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, skipped: 'no active scooter rentals' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Fetch customers for these rentals
    const customerIds = [...new Set(scooterRentals.map(r => r.customer_id))];
    const { data: customers, error: cErr } = await supabase
      .from('customers')
      .select('id, name, phone')
      .in('id', customerIds);
    if (cErr) throw cErr;

    const customerMap = new Map((customers || []).map(c => [c.id, c]));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const message =
      "hey it's Jonathan from Scooter Rental! this is an automated reminder for you to put engine oil to the scooter as instructed and check the tyre pressure. Text me to my personal if questions 0476474172";

    const results: Array<{ rental_id: string; phone: string; status: string }> = [];

    for (const rental of scooterRentals) {
      const startDate = new Date(rental.start_date);
      startDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.round((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      // Only send on exact 14-day multiples (day 14, 28, 42, …)
      if (daysDiff <= 0 || daysDiff % 14 !== 0) continue;

      const customer = customerMap.get(rental.customer_id);
      if (!customer?.phone) {
        results.push({ rental_id: rental.id, phone: 'missing', status: 'skipped_no_phone' });
        continue;
      }

      const phone = normalizeAusPhone(customer.phone);
      if (!phone) {
        results.push({ rental_id: rental.id, phone: customer.phone, status: 'skipped_invalid_phone' });
        continue;
      }

      try {
        await sendSms(phone, message);
        results.push({ rental_id: rental.id, phone, status: 'sent' });
      } catch (e) {
        results.push({ rental_id: rental.id, phone, status: `error: ${e.message}` });
      }
    }

    return new Response(JSON.stringify({ success: true, sent: results.filter(r => r.status === 'sent').length, results }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
