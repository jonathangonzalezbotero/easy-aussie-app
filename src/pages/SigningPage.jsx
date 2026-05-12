import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ContractDocument from '../components/ContractDocument';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;

function buildD(rental, settings) {
  const customer = rental.customers || {};
  const vehicle  = rental.vehicles  || {};
  const s        = settings         || {};
  return {
    ownerCompany:     s.owner_company     || 'Easy Aussie AU Pty Ltd',
    ownerABN:         s.owner_abn         || '',
    ownerResponsible: s.owner_responsible || '',
    renterName:       customer.name       || '',
    renterDOB:        customer.date_of_birth || '',
    renterAddress:    customer.address    || '',
    renterPhone:      customer.phone      || '',
    vehicleMake:      vehicle.make        || '',
    vehicleModel:     vehicle.model       || '',
    vehicleYear:      vehicle.year        || '',
    vehicleColour:    vehicle.colour      || '',
    vehicleRego:      vehicle.plate       || '',
    vehicleEngine:    vehicle.engine_capacity || '',
    vehicleCondition: vehicle.condition_notes || '',
    startDate:        rental.start_date   || '',
    endDate:          rental.end_date     || '',
    bondAmount:       rental.bond_amount  ? String(rental.bond_amount) : (s.default_bond || '300'),
    contractNumber:   rental.contract_number || '',
    odometer:         rental.odometer     ? Number(rental.odometer).toLocaleString() : '',
    renterSignedName: null,
    renterSignedAt:   null,
  };
}

export default function SigningPage() {
  const { token } = useParams();

  const [status, setStatus]         = useState('loading'); // loading | ready | already-signed | expired | invalid | done | error
  const [contractData, setContractData] = useState(null);
  const [signerName, setSignerName] = useState('');
  const [agreed, setAgreed]         = useState(false);
  const [signing, setSigning]       = useState(false);
  const [signedAt, setSignedAt]     = useState(null);
  const [errMsg, setErrMsg]         = useState('');

  useEffect(() => {
    fetch(`${SUPABASE_URL}/functions/v1/get-contract-data?token=${token}`, {
      headers: { 'apikey': ANON_KEY },
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 410) { setStatus('expired'); return; }
          if (res.status === 404) { setStatus('invalid'); return; }
          throw new Error(json.error || 'Failed to load contract');
        }
        if (json.signingRequest.status === 'signed') {
          setSignedAt(json.signingRequest.signed_at);
          setSignerName(json.signingRequest.signer_name || '');
          setStatus('already-signed');
          return;
        }
        setContractData(json);
        setStatus('ready');
      })
      .catch(err => { setErrMsg(err.message); setStatus('error'); });
  }, [token]);

  const submitSignature = async () => {
    if (!signerName.trim() || !agreed) return;
    setSigning(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/complete-signing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY },
        body: JSON.stringify({ token, signer_name: signerName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Signing failed');
      setSignedAt(json.signed_at);
      setStatus('done');
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setSigning(false);
    }
  };

  // ── Status screens ─────────────────────────────────────────────────────────

  if (status === 'loading') {
    return (
      <div style={centerStyle}>
        <div style={{ fontSize: 14, color: '#666' }}>Loading contract…</div>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <StatusScreen
        icon="⏱"
        title="This link has expired"
        message="Signing links are valid for 7 days. Please contact Easy Aussie AU to request a new link."
      />
    );
  }

  if (status === 'invalid') {
    return (
      <StatusScreen
        icon="🔗"
        title="Invalid signing link"
        message="This link doesn't appear to be valid. Please check the email you received and try again."
      />
    );
  }

  if (status === 'error') {
    return (
      <StatusScreen
        icon="⚠"
        title="Something went wrong"
        message={errMsg || 'Unable to load the contract. Please try again or contact Easy Aussie AU.'}
      />
    );
  }

  if (status === 'already-signed') {
    return (
      <StatusScreen
        icon="✓"
        title="Already signed"
        message={`This contract was already signed by ${signerName}${signedAt ? ' on ' + new Date(signedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}. No further action is needed.`}
        green
      />
    );
  }

  if (status === 'done') {
    return (
      <StatusScreen
        icon="✓"
        title="Contract signed successfully"
        message={`Thank you, ${signerName}. Your signature has been recorded${signedAt ? ' on ' + new Date(signedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}. Easy Aussie AU will be in touch shortly.`}
        green
      />
    );
  }

  // ── Ready: show contract + sign form ──────────────────────────────────────

  const { rental, settings } = contractData;
  const d       = buildD(rental, settings);
  const vehicle = rental.vehicles || {};
  const isEbike = vehicle.type === 'ebike';
  const isCar   = vehicle.type === 'car';

  return (
    <div style={{ background: '#f5f4f0', minHeight: '100vh' }}>
      {/* Header bar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e3e1da', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 28, height: 28, background: '#2d8a5a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="4.5" cy="13.5" rx="1.8" ry="1.8"/><ellipse cx="13.5" cy="13.5" rx="1.8" ry="1.8"/>
            <path d="M2.7 13.5H1.5V9L4.5 4.5h7.5L14.5 9h2v4.5h-1.3"/><path d="M6.3 13.5h5.4"/><path d="M4.5 4.5v4.5h9"/>
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>Easy Aussie AU</span>
        <span style={{ fontSize: 13, color: '#888', marginLeft: 4 }}>· Rental Agreement for Review &amp; Signature</span>
      </div>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 16px 80px' }}>
        {/* Contract */}
        <ContractDocument d={d} isEbike={isEbike} isCar={isCar} ownerSignature={true} />

        {/* Sign form */}
        <div style={{ background: 'white', borderRadius: 12, padding: '36px 40px', marginTop: 24, boxShadow: '0 2px 20px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Sign this agreement</div>
          <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7, marginBottom: 24 }}>
            By typing your full legal name below and checking the box, you are electronically signing this rental agreement.
            Under the Australian <em>Electronic Transactions Act 1999</em>, your typed name constitutes a legally binding signature.
          </p>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#666', marginBottom: 8 }}>
              Your full legal name
            </label>
            <input
              type="text"
              placeholder={d.renterName || 'Type your full name here'}
              value={signerName}
              onChange={e => setSignerName(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                border: '1.5px solid #d0d0cc', borderRadius: 8,
                padding: '12px 14px',
                fontFamily: 'Georgia, serif', fontSize: 20, color: '#1a1a1a',
                letterSpacing: '0.02em', outline: 'none',
              }}
            />
            {signerName && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e5e5e5' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Preview</div>
                <div style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: '#1a1a1a', letterSpacing: '0.02em' }}>{signerName}</div>
              </div>
            )}
          </div>

          <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 28 }}>
            <input
              type="checkbox"
              checked={agreed}
              onChange={e => setAgreed(e.target.checked)}
              style={{ marginTop: 2, width: 16, height: 16, accentColor: '#2d8a5a', flexShrink: 0 }}
            />
            <span style={{ fontSize: 13.5, lineHeight: 1.6, color: '#333' }}>
              I, <strong>{signerName || '_______________'}</strong>, confirm that I have read and understood this rental agreement in full,
              and I agree that typing my name above constitutes my legal electronic signature and binds me to all terms contained within.
            </span>
          </label>

          {errMsg && (
            <div style={{ background: '#fce8e5', border: '1px solid #b33020', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#7f1d1d', marginBottom: 16 }}>
              {errMsg}
            </div>
          )}

          <button
            onClick={submitSignature}
            disabled={!signerName.trim() || !agreed || signing}
            style={{
              width: '100%', padding: '14px', borderRadius: 8, border: 'none', cursor: (!signerName.trim() || !agreed || signing) ? 'not-allowed' : 'pointer',
              background: (!signerName.trim() || !agreed) ? '#ccc' : '#2d8a5a',
              color: 'white', fontSize: 15, fontWeight: 700, transition: 'background 0.15s',
            }}
          >
            {signing ? 'Submitting…' : 'Sign Contract'}
          </button>

          <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
            Your name, the date, and your IP address will be recorded as part of the electronic signature audit trail.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatusScreen({ icon, title, message, green = false }) {
  return (
    <div style={centerStyle}>
      <div style={{ background: 'white', borderRadius: 16, padding: '48px 40px', maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 2px 20px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 48, marginBottom: 20 }}>{icon}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: green ? '#166534' : '#1a1a1a', marginBottom: 12 }}>{title}</div>
        <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7 }}>{message}</p>
        <div style={{ marginTop: 28, fontSize: 12, color: '#aaa' }}>Easy Aussie AU Pty Ltd · Queensland, Australia</div>
      </div>
    </div>
  );
}

const centerStyle = {
  minHeight: '100vh', background: '#f5f4f0',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
};
