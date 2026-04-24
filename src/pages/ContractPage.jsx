import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';

const fmtDate = (s) => {
  if (!s) return '_______________';
  return new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function ContractPage() {
  const { state } = useLocation();
  const navigate  = useNavigate();
  const { data }  = useStore();
  const [downloading, setDownloading] = useState(false);
  const contractRef = useRef(null);

  const rental   = data.rentals.find(r => r.id === state?.rentalId);
  const customer = rental ? data.customers.find(c => c.id === rental.customerId) : null;
  const vehicle  = rental ? data.vehicles.find(v => v.id === rental.vehicleId)   : null;
  const settings = data.settings || {};

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
  };

  const today     = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
  const makeModel = [d.vehicleMake, d.vehicleModel].filter(Boolean).join(' ') || '_______________';

  const missing = [];
  if (!d.vehicleMake && !d.vehicleModel) missing.push('vehicle make/model');
  if (!d.renterName)  missing.push('renter name');
  if (!d.startDate)   missing.push('start date');

  const downloadPDF = async () => {
    setDownloading(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const filename = `contract-${d.renterName.replace(/\s+/g, '-')}-${d.vehicleRego}-${rental.startDate}.pdf`.toLowerCase();
      await html2pdf()
        .set({
          margin:      [10, 10, 10, 10],
          filename,
          image:       { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(contractRef.current)
        .save();
    } finally { setDownloading(false); }
  };

  const sections = [
    { num: '1', title: 'Scooter Details', content: (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px 16px' }}>
        {[['Make and Model', makeModel], ['Year', d.vehicleYear || '_______________'], ['Colour', d.vehicleColour ? d.vehicleColour.toUpperCase() : '_______________'], ['Registration', d.vehicleRego || '_______________'], ['Engine Capacity', d.vehicleEngine || '_______________']].map(([l, v]) => (
          <div key={l}><div style={{ fontSize: 11, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{l}</div><div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div></div>
        ))}
      </div>
    )},
    { num: '2', title: 'Rental Period (Weekly Basis)', content: (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px 16px' }}>
        {[['Start Date', fmtDate(d.startDate)], ['End Date', d.endDate ? fmtDate(d.endDate) : 'Ongoing weekly rental']].map(([l, v]) => (
          <div key={l}><div style={{ fontSize: 11, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{l}</div><div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div></div>
        ))}
      </div>
    )},
    { num: '3', title: 'Payment & Security Bond', content: (
      <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333' }}>
        <p style={{ marginBottom: 8 }}>Rental fees must be paid before scooter key handover.</p>
        <p style={{ marginBottom: 8 }}>A refundable security bond of <strong>${d.bondAmount} AUD</strong> is required.</p>
        <p style={{ marginBottom: 4 }}>The bond may be used to cover:</p>
        <ul style={{ marginLeft: 20, marginBottom: 8 }}>
          {['Insurance excess', 'Damage, loss, or theft', 'Traffic fines, tolls, penalties', 'Late return, cleaning, or recovery costs'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
        <p>Bond refunds are processed after inspection to check for fines and may take up to 24 hours.</p>
      </div>
    )},
    { num: '4', title: 'Licensing & Eligibility (QLD Law)', content: (
      <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333' }}>
        <p style={{ marginBottom: 4 }}>The Renter declares that they:</p>
        <ul style={{ marginLeft: 20 }}>
          {['Are 18 years of age or older', 'Hold a valid Australian or international licence legally permitting them to ride a 50cc scooter in Queensland', 'Are medically fit to operate a motor vehicle', 'Only the Renter is permitted to operate the scooter'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
      </div>
    )},
    { num: '5', title: 'Safety & Road Rules (Mandatory)', content: (
      <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333' }}>
        <p style={{ marginBottom: 4 }}>The Renter agrees to:</p>
        <ul style={{ marginLeft: 20, marginBottom: 8 }}>
          {['Wear an approved helmet at all times', 'Comply with Queensland road laws', 'Ride only on permitted public roads', 'NOT ride on footpaths, beaches, boardwalks, bike paths, or pedestrian areas'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
        <p>Failure to comply constitutes a serious breach of this Agreement.</p>
      </div>
    )},
    { num: '6', title: 'Fines, Tolls, Accidents & Insurance', content: (
      <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333' }}>
        <div style={{ marginTop: 10 }}><strong>6.1 Traffic Fines and Tolls</strong><p>The Renter is responsible for all traffic infringements, parking fines, and toll charges during the rental period.</p></div>
        <div style={{ marginTop: 10 }}><strong>6.2 Accidents and Damage</strong><p>The Renter is responsible for any loss, damage, or theft of the moped occurring during the rental period. The Renter must immediately notify the Owner and, if applicable, the police of any accident, theft, or incident. Rental fees continue until the moped is repaired or replaced.</p></div>
        <div style={{ marginTop: 10 }}><strong>6.3 Insurance</strong><p>The moped is covered by CTP insurance as required by Queensland law. CTP does not cover damage to the moped, damage to third-party property, or personal injury to the Renter. The Renter remains fully liable for any damage or loss not covered by CTP.</p></div>
      </div>
    )},
    { num: '7', title: 'Condition of the Scooter', content: (
      <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333' }}>
        <p><strong>At the Start:</strong> The Owner confirms the moped is in good working and roadworthy condition.</p>
        <div style={{ border: '1px solid #d0d0cc', borderRadius: 8, padding: '12px 14px', margin: '8px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Existing damage (if any)</div>
          <div style={{ fontSize: 13.5, minHeight: 28, color: d.vehicleCondition ? '#c05000' : '#999' }}>{d.vehicleCondition || 'None'}</div>
        </div>
        <p><strong>At the End:</strong> The Renter must return the moped in the same condition, except for fair wear and tear, and with the same level of fuel.</p>
      </div>
    )},
    { num: '8', title: 'Prohibited Uses', content: (
      <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333' }}>
        <p style={{ marginBottom: 4 }}>The moped must not be used for:</p>
        <ul style={{ marginLeft: 20 }}>
          {['Racing or competition', 'Carrying more passengers than designed', 'Towing other vehicles or trailers', 'Off-road or beach riding', 'Operation under the influence of alcohol or drugs'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
      </div>
    )},
    { num: '9',  title: 'Insurance Included', content: <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333' }}>The rental price includes comprehensive insurance, subject to the terms, limitations, and exclusions outlined in this Agreement. The included insurance includes CTP as required by Queensland law and limited damage protection.</p> },
    { num: '10', title: 'Insurance Limitations & Exclusions', content: <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333' }}>The included insurance does NOT cover: theft, loss, or total write-off; damage caused by reckless or illegal use; riding under the influence; riding outside permitted areas; mechanical damage caused by misuse; personal injury to the Renter; damage to personal property; fines, penalties, towing, or recovery costs; or loss of use.</p> },
    { num: '11', title: 'Personal Insurance Recommendation', content: <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333' }}>Easy Aussie AU Pty Ltd strongly recommends the Renter holds personal travel insurance and personal health or accident insurance. The Renter acknowledges the included insurance does not cover personal injury, medical costs, or loss of personal belongings.</p> },
    { num: '12', title: 'Assumption of Risk', content: <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333' }}>The Renter acknowledges that riding a scooter involves inherent risks, including serious injury or death. The Renter voluntarily accepts all risks, whether foreseeable or not.</p> },
    { num: '13', title: 'Indemnity', content: <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333' }}>The Renter agrees to indemnify and hold harmless the Owner from any claim, loss, or expense (including legal costs) arising out of the Renter's use of the scooter, except where caused by the Owner's negligence or breach of this Agreement.</p> },
    { num: '14', title: 'Governing Law', content: <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333' }}>This Agreement is governed by the laws of Queensland, Australia. Any disputes will be resolved through appropriate legal channels within Queensland.</p> },
  ];

  const sectionStyle = { marginBottom: 22 };
  const sectionTitleStyle = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#2d8a5a', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #d0d0cc', display: 'flex', alignItems: 'center', gap: 8 };
  const numBadge = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#2d8a5a', color: 'white', width: 20, height: 20, borderRadius: '50%', fontSize: 11, fontWeight: 700, flexShrink: 0 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#f5f4f0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Toolbar */}
      <div style={{ background: 'white', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, zIndex: 10, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: 'var(--accent)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="4.5" cy="13.5" rx="1.8" ry="1.8"/><ellipse cx="13.5" cy="13.5" rx="1.8" ry="1.8"/>
              <path d="M2.7 13.5H1.5V9L4.5 4.5h7.5L14.5 9h2v4.5h-1.3"/><path d="M6.3 13.5h5.4"/><path d="M4.5 4.5v4.5h9"/>
            </svg>
          </div>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>
            Rental Agreement · {d.renterName || '—'}{d.vehicleRego ? ' · ' + d.vehicleRego : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Back</button>
          <button className="btn btn-primary" onClick={downloadPDF} disabled={downloading}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {downloading ? 'Generating PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Contract body — this div is captured by html2pdf */}
      <div style={{ padding: '32px 16px 64px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
        <div ref={contractRef} style={{ background: 'white', borderRadius: 12, padding: '48px 56px', boxShadow: '0 2px 20px rgba(0,0,0,0.06)', fontFamily: "'DM Sans', sans-serif" }}>

          {missing.length > 0 && (
            <div style={{ background: 'oklch(0.96 0.05 70)', border: '1px solid oklch(0.58 0.14 70)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'oklch(0.40 0.14 70)', marginBottom: 20, fontWeight: 500 }}>
              Some fields are incomplete: {missing.join(', ')}. Update vehicle and customer records for a complete contract.
            </div>
          )}

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32, paddingBottom: 24, borderBottom: '2px solid #1a1a1a' }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>{d.ownerCompany}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>Bike Rental Agreement</div>
            <div style={{ fontSize: 14 }}>Date: <strong>{today}</strong></div>
          </div>

          {/* Parties */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 28, padding: '20px 24px', background: '#f7f6f2', borderRadius: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#666', marginBottom: 10 }}>The Owner</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{d.ownerCompany}</div>
              <div style={{ fontSize: 13, color: '#666' }}>ABN: {d.ownerABN}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#666', marginBottom: 10 }}>The Renter</div>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>{d.renterName || '_______________'}</div>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
                {d.renterDOB && <>Date of birth: {fmtDate(d.renterDOB)}<br /></>}
                {d.renterAddress && <>{d.renterAddress}<br /></>}
                {d.renterPhone}
              </div>
            </div>
          </div>

          {/* Sections */}
          {sections.map(s => (
            <div key={s.num} style={sectionStyle}>
              <div style={sectionTitleStyle}>
                <span style={numBadge}>{s.num}</span>
                {s.title}
              </div>
              {s.content}
            </div>
          ))}

          {/* Signatures */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>
              <span style={numBadge}>15</span>
              Signatures
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333', marginBottom: 24 }}>
              By signing this Agreement, the Renter confirms that they have read and understood all terms, understand the insurance inclusions and exclusions, accept financial responsibility where insurance does not apply, and agree to comply with all Queensland road laws.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
              {[{ label: 'Owner', name: d.ownerCompany, role: d.ownerResponsible }, { label: 'Renter', name: d.renterName, role: '' }].map(sig => (
                <div key={sig.label}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 40 }}>{sig.label}</div>
                  <div style={{ borderBottom: '1.5px solid #1a1a1a', marginBottom: 6 }} />
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{sig.name}</div>
                  {sig.role && <div style={{ fontSize: 12, color: '#666' }}>{sig.role}</div>}
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Date</div>
                    <div style={{ borderBottom: '1.5px solid #1a1a1a', width: 120 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
