import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

const EF = {
  name: '', dateOfBirth: '', phone: '', email: '',
  addressStreet: '', addressSuburb: '', addressState: '', addressPostCode: '',
  occupation: '', emergencyContact: '', emergencyPhone: '', hotelAddress: '',
  licenseRef: '', licencePhoto: '', licenceFileName: '',
};

export default function CustomerIntake() {
  const [form, setForm]             = useState(EF);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState('');
  const fileInputRef = useRef(null);
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('File must be under 10MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(f => ({ ...f, licencePhoto: ev.target.result, licenceFileName: file.name }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())       { setError('Full name is required'); return; }
    if (!form.dateOfBirth)       { setError('Date of birth is required'); return; }
    if (!form.phone.trim())      { setError('Phone number is required'); return; }
    if (!form.email.trim())      { setError('Email address is required'); return; }
    if (!form.addressStreet.trim()) { setError('Street address is required'); return; }
    if (!form.addressSuburb.trim()) { setError('Suburb is required'); return; }
    if (!form.addressState.trim())  { setError('State is required'); return; }
    if (!form.addressPostCode.trim()) { setError('Postcode is required'); return; }
    if (!form.occupation.trim()) { setError('Occupation is required'); return; }
    if (!form.licencePhoto)      { setError('A photo or scan of your licence is required'); return; }
    setError('');
    setSubmitting(true);
    try {
      const { error: err } = await supabase.from('customers').insert({
        name:              form.name,
        date_of_birth:     form.dateOfBirth || null,
        phone:             form.phone || null,
        email:             form.email || null,
        address:           [form.addressStreet, form.addressSuburb, form.addressState, form.addressPostCode].filter(Boolean).join(', ') || null,
        occupation:        form.occupation || null,
        emergency_contact: form.emergencyContact || null,
        emergency_phone:   form.emergencyPhone || null,
        hotel_address:     form.hotelAddress || null,
        license_ref:       form.licenseRef || null,
        licence_photo:     form.licencePhoto || null,
        notes:             'Submitted via intake form',
      });
      if (err) throw err;
      setSubmitted(true);
    } catch (err) {
      setError('Something went wrong. Please try again or contact the rental office.');
      console.error(err);
    } finally { setSubmitting(false); }
  };

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f4f0', padding: 20, fontFamily: "'DM Sans', sans-serif" }}>
        <div style={{ maxWidth: 480, width: '100%', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, background: 'oklch(0.93 0.07 150)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="oklch(0.50 0.14 150)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 12 }}>Details submitted!</h1>
          <p style={{ fontSize: 15, color: '#666', lineHeight: 1.6 }}>
            Thank you. Your details have been received and your record has been created.
            The rental team will be in touch shortly.
          </p>
        </div>
      </div>
    );
  }

  const inputStyle   = { fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: '#1a1a1a', background: '#f7f6f2', border: '1.5px solid #e0dfd8', borderRadius: 9, padding: '11px 14px', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const labelStyle   = { fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block' };
  const fieldStyle   = { display: 'flex', flexDirection: 'column', gap: 5 };
  const dividerStyle = { display: 'flex', alignItems: 'center', gap: 10, color: '#999', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '4px 0 2px' };

  const isImage = form.licencePhoto?.startsWith('data:image/');

  return (
    <div style={{ minHeight: '100vh', background: '#f5f4f0', padding: '32px 16px 64px', fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        .intake-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 480px) { .intake-grid { grid-template-columns: 1fr; } .intake-full { grid-column: 1 !important; } }
        .intake-full { grid-column: 1 / -1; }
      `}</style>
      <div style={{ maxWidth: 540, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo.png" alt="Easy Aussie" style={{ height: 72, objectFit: 'contain', marginBottom: 16 }} />
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8, color: '#1a1a1a' }}>Customer Intake Form</h1>
          <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
            Please fill in your details before your rental. All information is kept securely and used only for your rental agreement.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ background: 'white', borderRadius: 16, padding: '28px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Personal Details */}
            <div className="intake-grid">
              <div style={{ ...fieldStyle }} className="intake-full">
                <label style={labelStyle}>Full Name *</label>
                <input style={inputStyle} value={form.name} onChange={e => sf('name', e.target.value)} required placeholder="As shown on your licence" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Date of Birth *</label>
                <input style={inputStyle} type="date" value={form.dateOfBirth} onChange={e => sf('dateOfBirth', e.target.value)} required />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Phone *</label>
                <input style={inputStyle} type="tel" value={form.phone} onChange={e => sf('phone', e.target.value)} required placeholder="+61 4xx xxx xxx" />
              </div>
              <div style={fieldStyle} className="intake-full">
                <label style={labelStyle}>Email *</label>
                <input style={inputStyle} type="email" value={form.email} onChange={e => sf('email', e.target.value)} required />
              </div>
              <div style={fieldStyle} className="intake-full">
                <label style={labelStyle}>Street Address *</label>
                <input style={inputStyle} value={form.addressStreet} onChange={e => sf('addressStreet', e.target.value)} required placeholder="e.g. 12 Ocean Drive" />
              </div>
              <div style={fieldStyle} className="intake-full">
                <label style={labelStyle}>Suburb *</label>
                <input style={inputStyle} value={form.addressSuburb} onChange={e => sf('addressSuburb', e.target.value)} required placeholder="e.g. Surfers Paradise" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>State *</label>
                <select style={inputStyle} value={form.addressState} onChange={e => sf('addressState', e.target.value)} required>
                  <option value="">Select…</option>
                  <option>QLD</option><option>NSW</option><option>VIC</option>
                  <option>WA</option><option>SA</option><option>TAS</option>
                  <option>ACT</option><option>NT</option>
                </select>
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Postcode *</label>
                <input style={inputStyle} value={form.addressPostCode} onChange={e => sf('addressPostCode', e.target.value)} required placeholder="e.g. 4217" inputMode="numeric" maxLength={4} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Occupation *</label>
                <input style={inputStyle} value={form.occupation} onChange={e => sf('occupation', e.target.value)} required />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Hotel / Airbnb (if applicable)</label>
                <input style={inputStyle} value={form.hotelAddress} onChange={e => sf('hotelAddress', e.target.value)} placeholder="Where you're staying locally" />
              </div>
            </div>

            {/* Emergency Contact */}
            <div style={dividerStyle}>
              <div style={{ flex: 1, height: 1, background: '#e0dfd8' }} />
              <span>Emergency Contact</span>
              <div style={{ flex: 1, height: 1, background: '#e0dfd8' }} />
            </div>
            <div className="intake-grid">
              <div style={fieldStyle}>
                <label style={labelStyle}>Contact Name</label>
                <input style={inputStyle} value={form.emergencyContact} onChange={e => sf('emergencyContact', e.target.value)} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Contact Phone</label>
                <input style={inputStyle} type="tel" value={form.emergencyPhone} onChange={e => sf('emergencyPhone', e.target.value)} />
              </div>
            </div>

            {/* Driver's Licence */}
            <div style={dividerStyle}>
              <div style={{ flex: 1, height: 1, background: '#e0dfd8' }} />
              <span>Driver&apos;s Licence</span>
              <div style={{ flex: 1, height: 1, background: '#e0dfd8' }} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Licence Number</label>
              <input style={inputStyle} value={form.licenseRef} onChange={e => sf('licenseRef', e.target.value)} placeholder="Your driver's licence number" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Licence Photo / Scan *</label>
              <p style={{ fontSize: 13, color: '#888', marginBottom: 8, lineHeight: 1.5 }}>
                Take a photo, use your camera, or upload a file (JPG, PNG, PDF). Max 10MB.
              </p>
              {form.licencePhoto ? (
                <div>
                  {isImage
                    ? <img src={form.licencePhoto} alt="Licence" style={{ maxWidth: '100%', borderRadius: 10, border: '1.5px solid #e0dfd8', marginBottom: 8 }} />
                    : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f7f6f2', border: '1.5px solid #e0dfd8', borderRadius: 10, padding: '12px 16px', marginBottom: 8 }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span style={{ fontSize: 14, color: '#333', fontWeight: 500 }}>{form.licenceFileName}</span>
                      </div>
                    )
                  }
                  <button type="button" style={{ background: '#fee', border: '1px solid #fcc', color: '#c00', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                    onClick={() => { setForm(f => ({ ...f, licencePhoto: '', licenceFileName: '' })); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                    Remove
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Camera / gallery / file — three separate triggers for best mobile compat */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf,.txt,.doc,.docx"
                    onChange={handleFile}
                    style={{ display: 'none' }}
                    id="licence-file"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleFile}
                    style={{ display: 'none' }}
                    id="licence-camera"
                  />
                  <label htmlFor="licence-camera" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'oklch(0.50 0.14 150)', border: 'none', borderRadius: 9, padding: '12px 18px', cursor: 'pointer', fontSize: 14, color: 'white', fontWeight: 600 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    Take a Photo
                  </label>
                  <label htmlFor="licence-file" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#f7f6f2', border: '1.5px dashed #c0bfb8', borderRadius: 9, padding: '12px 18px', cursor: 'pointer', fontSize: 14, color: '#555', fontWeight: 500 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Upload from Gallery or Files
                  </label>
                </div>
              )}
            </div>

            {error && (
              <div style={{ background: '#fee8e8', border: '1px solid #fcc', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#c00' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              style={{ background: submitting ? '#999' : 'oklch(0.50 0.14 150)', color: 'white', border: 'none', borderRadius: 10, padding: '14px', fontSize: 15, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', marginTop: 4 }}
            >
              {submitting ? 'Submitting…' : 'Submit My Details'}
            </button>

            <p style={{ fontSize: 12, color: '#999', textAlign: 'center', lineHeight: 1.5 }}>
              Your information is used solely for your rental agreement and is stored securely. It will not be shared with third parties.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
