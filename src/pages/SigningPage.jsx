import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import ContractDocument, { fmtMoney } from '../components/ContractDocument';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY     = import.meta.env.VITE_SUPABASE_ANON_KEY;

const signingCss = `
.sign-page-header { padding: 14px 24px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.sign-page-body { max-width: 800px; margin: 0 auto; padding: 32px 16px 80px; }
.sign-card { background: white; border-radius: 12px; padding: 36px 40px; margin-top: 24px; box-shadow: 0 2px 20px rgba(0,0,0,0.06); }
.sign-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.sign-name-input { width: 100%; box-sizing: border-box; border: 1.5px solid #d0d0cc; border-radius: 8px; padding: 12px 14px; font-family: Georgia, serif; font-size: 20px; color: #1a1a1a; letter-spacing: 0.02em; outline: none; }
.sign-preview-name { font-family: Georgia, serif; font-size: 26px; color: #1a1a1a; letter-spacing: 0.02em; overflow-wrap: anywhere; }

@media (max-width: 700px) {
  .sign-page-header { padding: 12px 16px; gap: 8px; }
  .sign-page-body { padding: 20px 12px 56px; }
  .sign-card { padding: 24px 20px; border-radius: 10px; margin-top: 16px; }
  .sign-summary { grid-template-columns: 1fr; gap: 12px; }
  .sign-preview-name { font-size: 22px; }
}
@media (max-width: 420px) {
  .sign-card { padding: 20px 16px; }
  .sign-name-input { font-size: 17px; }
}
`;

function buildD(rental, settings, signedName = null, signedAt = null) {
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
    price:            rental.price        || '',
    contractNumber:   rental.contract_number || '',
    odometer:         rental.odometer     ? Number(rental.odometer).toLocaleString() : '',
    renterSignedName: signedName,
    renterSignedAt:   signedAt,
  };
}

const fmtDay = (s) =>
  s ? new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

const fmtStamp = (ts, withTime = false) =>
  new Date(ts).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });

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
      headers: { 'Authorization': `Bearer ${ANON_KEY}` },
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          if (res.status === 410) { setStatus('expired'); return; }
          if (res.status === 404) { setStatus('invalid'); return; }
          throw new Error(json.error || 'Failed to load contract');
        }
        setContractData(json);
        if (json.signingRequest.status === 'signed') {
          setSignedAt(json.signingRequest.signed_at);
          setSignerName(json.signingRequest.signer_name || '');
          setStatus('already-signed');
          return;
        }
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
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ token, signer_name: signerName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Signing failed');
      setSignedAt(json.signed_at);
      setStatus('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

  // ── Contract view (unsigned → sign form, signed → read-only copy) ──────────

  const isSigned = status === 'already-signed' || status === 'done';
  const { rental, settings } = contractData;
  const d       = buildD(rental, settings, isSigned ? signerName : null, isSigned ? signedAt : null);
  const vehicle = rental.vehicles || {};
  const isEbike = vehicle.type === 'ebike';
  const isCar   = vehicle.type === 'car';

  const period = [fmtDay(d.startDate), d.endDate ? fmtDay(d.endDate) : 'Ongoing'].filter(Boolean).join(' → ');

  return (
    <div style={{ background: '#f5f4f0', minHeight: '100vh' }}>
      <style>{signingCss}</style>

      {/* Header bar */}
      <div className="sign-page-header" style={{ background: 'white', borderBottom: '1px solid #e3e1da' }}>
        <div style={{ width: 28, height: 28, background: '#2d8a5a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="4.5" cy="13.5" rx="1.8" ry="1.8"/><ellipse cx="13.5" cy="13.5" rx="1.8" ry="1.8"/>
            <path d="M2.7 13.5H1.5V9L4.5 4.5h7.5L14.5 9h2v4.5h-1.3"/><path d="M6.3 13.5h5.4"/><path d="M4.5 4.5v4.5h9"/>
          </svg>
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>Easy Aussie AU</span>
        <span style={{ fontSize: 13, color: '#888' }}>
          · {isSigned ? 'Signed Rental Agreement' : 'Rental Agreement for Review & Signature'}
        </span>
      </div>

      <div className="sign-page-body">
        {/* Signed banner */}
        {isSigned && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: '20px 24px', marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>✓</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#166534', marginBottom: 4 }}>
                {status === 'done' ? 'Contract signed successfully' : 'This agreement has been signed'}
              </div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#15803d', margin: 0 }}>
                Signed by <strong>{signerName}</strong>{signedAt ? ` on ${fmtStamp(signedAt, true)}` : ''}.
                {status === 'done'
                  ? ' Easy Aussie AU will be in touch shortly. Your signed copy is below — keep this link for your records.'
                  : ' No further action is needed. Your signed copy is below.'}
              </p>
            </div>
          </div>
        )}

        {/* Payment summary */}
        <div style={{ background: 'white', borderRadius: 12, padding: '20px 24px', marginBottom: 20, boxShadow: '0 2px 20px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888', marginBottom: 14 }}>
            At a glance
          </div>
          <div className="sign-summary">
            <SummaryItem
              label="Rental fee"
              value={d.price ? `$${fmtMoney(d.price)}` : '—'}
              sub={d.price ? 'per week' : 'To be confirmed'}
              highlight
            />
            <SummaryItem label="Rental period" value={period || '—'} sub={d.endDate ? null : 'Weekly, ongoing'} />
            <SummaryItem label="Refundable bond" value={`$${fmtMoney(d.bondAmount)}`} sub="Returned after inspection" />
          </div>
        </div>

        {/* Contract */}
        <ContractDocument d={d} isEbike={isEbike} isCar={isCar} ownerSignature={true} />

        {/* Sign form — unsigned only */}
        {!isSigned && (
          <div className="sign-card">
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
                className="sign-name-input"
                type="text"
                placeholder={d.renterName || 'Type your full name here'}
                value={signerName}
                onChange={e => setSignerName(e.target.value)}
              />
              {signerName && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #e5e5e5' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Preview</div>
                  <div className="sign-preview-name">{signerName}</div>
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
              <span style={{ fontSize: 13.5, lineHeight: 1.6, color: '#333', overflowWrap: 'anywhere' }}>
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
        )}

        <div style={{ textAlign: 'center', fontSize: 12, color: '#aaa', marginTop: 24 }}>
          Easy Aussie AU Pty Ltd · Queensland, Australia
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, sub, highlight = false }) {
  return (
    <div style={{ background: highlight ? '#f0fdf4' : '#f7f6f2', border: `1px solid ${highlight ? '#86efac' : '#e3e1da'}`, borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: highlight ? '#166534' : '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: highlight ? 22 : 15, fontWeight: 700, color: highlight ? '#14532d' : '#1a1a1a', lineHeight: 1.3 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: highlight ? '#166534' : '#888', marginTop: 2 }}>{sub}</div>}
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
