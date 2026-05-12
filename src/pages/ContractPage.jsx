import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import ContractDocument from '../components/ContractDocument';

export default function ContractPage() {
  const { state } = useLocation();
  const navigate  = useNavigate();
  const { data }  = useStore();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendEmailOpen, setSendEmailOpen] = useState(false);
  const [emailAddr, setEmailAddr] = useState('');
  const [sendResult, setSendResult] = useState(null); // 'sent' | 'error'
  const contractRef = useRef(null);

  const rental   = data.rentals.find(r => r.id === state?.rentalId);
  const customer = rental ? data.customers.find(c => c.id === rental.customerId) : null;
  const vehicle  = rental ? data.vehicles.find(v => v.id === rental.vehicleId)   : null;
  const settings = data.settings || {};
  const isEbike  = vehicle?.type === 'ebike';
  const isCar    = vehicle?.type === 'car';

  // Signing status for this rental
  const sigReq = data.signingRequests
    ?.filter(s => s.rentalId === rental?.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] ?? null;

  if (!rental) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <p style={{ color: 'var(--muted)', marginBottom: 16 }}>No rental selected.</p>
        <button className="btn btn-secondary" onClick={() => navigate('/rentals')}>← Back to Rentals</button>
      </div>
    );
  }

  const d = {
    ownerCompany:     settings.ownerCompany || 'Easy Aussie AU Pty Ltd',
    ownerABN:         settings.ownerABN || '',
    ownerResponsible: settings.ownerResponsible || '',
    renterName:       customer?.name || '',
    renterDOB:        customer?.dateOfBirth || '',
    renterAddress:    customer?.address || '',
    renterPhone:      customer?.phone || '',
    vehicleMake:      vehicle?.make || '',
    vehicleModel:     vehicle?.model || '',
    vehicleYear:      vehicle?.year || '',
    vehicleColour:    vehicle?.colour || '',
    vehicleRego:      vehicle?.plate || '',
    vehicleEngine:    vehicle?.engineCapacity || '',
    vehicleCondition: vehicle?.conditionNotes || '',
    startDate:        rental.startDate || '',
    endDate:          rental.endDate || '',
    bondAmount:       rental.bond?.amount || settings.defaultBond || '300',
    contractNumber:   rental.contractNumber || '',
    odometer:         rental.odometer ? Number(rental.odometer).toLocaleString() : '',
    renterSignedName: sigReq?.status === 'signed' ? sigReq.signerName : null,
    renterSignedAt:   sigReq?.status === 'signed' ? sigReq.signedAt : null,
  };

  const agreementType = isCar ? 'Car Rental Agreement' : isEbike ? 'E-Bike Rental Agreement' : 'Scooter Rental Agreement';

  const downloadPDF = async () => {
    setDownloading(true);
    setDownloadError('');

    const hexOverrides = {
      '--bg': '#f8f7f2', '--sidebar': '#1c1a17', '--accent': '#2d8a5a',
      '--accent-hover': '#236b47', '--accent-light': '#d4f0e0', '--text': '#1e1b16',
      '--muted': '#737067', '--border': '#e3e1da', '--red': '#b33020',
      '--red-bg': '#fce8e5', '--amber': '#d97706', '--amber-bg': '#fef3c7',
      '--blue': '#2d5aad', '--blue-bg': '#e8eef8',
    };
    const root = document.documentElement;
    const saved = {};
    Object.entries(hexOverrides).forEach(([k, v]) => {
      saved[k] = root.style.getPropertyValue(k);
      root.style.setProperty(k, v);
    });

    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const namePart = d.renterName ? d.renterName.replace(/\s+/g, '-') : 'customer';
      const regoPart = d.vehicleRego || 'vehicle';
      const datePart = rental.startDate || 'date';
      const filename = `contract-${namePart}-${regoPart}-${datePart}.pdf`.toLowerCase();
      await html2pdf()
        .set({
          margin:      [10, 10, 10, 10],
          filename,
          image:       { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
          jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(contractRef.current)
        .save();
    } catch (err) {
      console.error('PDF generation failed:', err);
      setDownloadError("PDF generation failed. Try again or use your browser's print function (Ctrl+P / Cmd+P).");
    } finally {
      Object.entries(saved).forEach(([k, v]) => {
        if (v) root.style.setProperty(k, v);
        else root.style.removeProperty(k);
      });
      setDownloading(false);
    }
  };

  const openSendEmail = () => {
    setEmailAddr(customer?.email || '');
    setSendResult(null);
    setSendEmailOpen(true);
  };

  const sendForSigning = async () => {
    if (!emailAddr.trim()) return;
    setSendingEmail(true);
    setSendResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-signing-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ rental_id: rental.id, customer_email: emailAddr.trim(), customer_name: customer?.name || '' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to send');
      }
      setSendResult('sent');
    } catch (err) {
      console.error(err);
      setSendResult('error');
    } finally {
      setSendingEmail(false);
    }
  };

  const sigBadge = sigReq?.status === 'signed'
    ? { label: 'Signed', color: '#166534', bg: '#dcfce7' }
    : sigReq
      ? { label: 'Awaiting signature', color: '#92400e', bg: '#fef3c7' }
      : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#f5f4f0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ background: 'white', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="4.5" cy="13.5" rx="1.8" ry="1.8"/><ellipse cx="13.5" cy="13.5" rx="1.8" ry="1.8"/>
              <path d="M2.7 13.5H1.5V9L4.5 4.5h7.5L14.5 9h2v4.5h-1.3"/><path d="M6.3 13.5h5.4"/><path d="M4.5 4.5v4.5h9"/>
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {agreementType} · {d.renterName || '—'}{d.vehicleRego ? ' · ' + d.vehicleRego : ''}{d.contractNumber ? ' · ' + d.contractNumber : ''}
          </span>
          {sigBadge && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: sigBadge.bg, color: sigBadge.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {sigBadge.label}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Back</button>
            {sigReq?.status !== 'signed' && (
              <button className="btn btn-secondary" onClick={openSendEmail}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                {sigReq ? 'Resend for Signing' : 'Send for Signing'}
              </button>
            )}
            <button className="btn btn-primary" onClick={downloadPDF} disabled={downloading}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              {downloading ? 'Generating PDF…' : 'Download PDF'}
            </button>
          </div>
          {downloadError && (
            <div style={{ fontSize: 12, color: 'var(--red, #c00)', maxWidth: 320, textAlign: 'right', lineHeight: 1.4 }}>{downloadError}</div>
          )}
        </div>
      </div>

      {/* Send for Signing panel */}
      {sendEmailOpen && (
        <div style={{ background: '#f0fdf4', borderBottom: '1px solid #86efac', padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#166534' }}>Send signing link to:</span>
          <input
            style={{ border: '1px solid #86efac', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: 240, outline: 'none', background: 'white' }}
            type="email"
            placeholder="customer@email.com"
            value={emailAddr}
            onChange={e => setEmailAddr(e.target.value)}
            disabled={sendResult === 'sent'}
          />
          {sendResult !== 'sent' && (
            <button className="btn btn-primary btn-sm" onClick={sendForSigning} disabled={sendingEmail || !emailAddr.trim()}>
              {sendingEmail ? 'Sending…' : 'Send Email'}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => { setSendEmailOpen(false); setSendResult(null); }}>
            {sendResult === 'sent' ? 'Close' : 'Cancel'}
          </button>
          {sendResult === 'sent' && <span style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>Email sent! The customer will receive a signing link valid for 7 days.</span>}
          {sendResult === 'error' && <span style={{ fontSize: 13, color: 'var(--red)' }}>Failed to send. Check the email address and try again.</span>}
        </div>
      )}

      {/* Contract body */}
      <div style={{ padding: '32px 16px 64px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
        <ContractDocument d={d} isEbike={isEbike} isCar={isCar} contractRef={contractRef} />
      </div>
    </div>
  );
}
