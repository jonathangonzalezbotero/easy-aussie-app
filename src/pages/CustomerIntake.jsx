import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

const EF = {
  name: '', dateOfBirth: '', phone: '', email: '', address: '', occupation: '',
  emergencyContact: '', emergencyPhone: '', hotelAddress: '', licenseRef: '', licencePhoto: '',
};

export default function CustomerIntake() {
  const [form, setForm]       = useState(EF);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]     = useState('');
  const fileInputRef = useRef(null);
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Photo must be under 5MB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => sf('licencePhoto', ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Full name is required'); return; }
    setError('');
    setSubmitting(true);
    try {
      const { error: err } = await supabase.from('customers').insert({
        name:              form.name,
        date_of_birth:     form.dateOfBirth || null,
        phone:             form.phone || null,
        email:             form.email || null,
        address:           form.address || null,
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

  const inputStyle = { fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: '#1a1a1a', background: '#f7f6f2', border: '1.5px solid #e0dfd8', borderRadius: 9, padding: '11px 14px', outline: 'none', width: '100%', boxSizing: 'border-box' };
  const labelStyle = { fontSize: 12, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5, display: 'block' };
  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 5 };
  const dividerStyle = { display: 'flex', alignItems: 'center', gap: 10, color: '#999', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '4px 0 2px' };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f4f0', padding: '32px 16px 64px', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 540, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, background: 'oklch(0.50 0.14 150)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="26" height="26" viewBox="0 0 18 18" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="4.5" cy="13.5" rx="1.8" ry="1.8"/><ellipse cx="13.5" cy="13.5" rx="1.8" ry="1.8"/>
              <path d="M2.7 13.5H1.5V9L4.5 4.5h7.5L14.5 9h2v4.5h-1.3"/><path d="M6.3 13.5h5.4"/><path d="M4.5 4.5v4.5h9"/>
            </svg>
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8, color: '#1a1a1a' }}>Customer Intake Form</h1>
          <p style={{ fontSize: 14, color: '#666', lineHeight: 1.6 }}>
            Please fill in your details before your rental. All information is kept securely and used only for your rental agreement.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ background: 'white', borderRadius: 16, padding: '28px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Personal Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ ...fieldStyle, gridColumn: '1/-1' }}>
                <label style={labelStyle}>Full Name *</label>
                <input style={inputStyle} value={form.name} onChange={e => sf('name', e.target.value)} required placeholder="As shown on your licence" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Date of Birth</label>
                <input style={inputStyle} type="date" value={form.dateOfBirth} onChange={e => sf('dateOfBirth', e.target.value)} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Phone</label>
                <input style={inputStyle} type="tel" value={form.phone} onChange={e => sf('phone', e.target.value)} placeholder="+61 4xx xxx xxx" />
              </div>
              <div style={{ ...fieldStyle, gridColumn: '1/-1' }}>
                <label style={labelStyle}>Email</label>
                <input style={inputStyle} type="email" value={form.email} onChange={e => sf('email', e.target.value)} />
              </div>
              <div style={{ ...fieldStyle, gridColumn: '1/-1' }}>
                <label style={labelStyle}>Residential Address</label>
                <input style={inputStyle} value={form.address} onChange={e => sf('address', e.target.value)} placeholder="Your home address" />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Occupation</label>
                <input style={inputStyle} value={form.occupation} onChange={e => sf('occupation', e.target.value)} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Hotel / Airbnb (if applicable)</label>
                <input style={inputStyle} value={form.hotelAddress} onChange={e => sf('hotelAddress', e.target.value)} placeholder="Where you're staying locally" />
              </div>
            </div>

            {/* Emergency Contact */}
            <div style={{ ...dividerStyle }}>
              <div style={{ flex: 1, height: 1, background: '#e0dfd8' }} />
              <span>Emergency Contact</span>
              <div style={{ flex: 1, height: 1, background: '#e0dfd8' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
            <div style={{ ...dividerStyle }}>
              <div style={{ flex: 1, height: 1, background: '#e0dfd8' }} />
              <span>Driver&apos;s Licence</span>
              <div style={{ flex: 1, height: 1, background: '#e0dfd8' }} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Licence Number</label>
              <input style={inputStyle} value={form.licenseRef} onChange={e => sf('licenseRef', e.target.value)} placeholder="Your driver's licence number" />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Licence Photo (optional)</label>
              <p style={{ fontSize: 13, color: '#888', marginBottom: 8 }}>Take a clear photo of the front of your licence. Max 5MB.</p>
              {form.licencePhoto ? (
                <div>
                  <img src={form.licencePhoto} alt="Licence" style={{ maxWidth: 220, borderRadius: 10, border: '1.5px solid #e0dfd8', marginBottom: 8 }} />
                  <br />
                  <button type="button" style={{ background: '#fee', border: '1px solid #fcc', color: '#c00', borderRadius: 8, padding: '6px 12px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }} onClick={() => { sf('licencePhoto', ''); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                    Remove photo
                  </button>
                </div>
              ) : (
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{ display: 'none' }} id="licence-photo" />
                  <label htmlFor="licence-photo" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#f7f6f2', border: '1.5px dashed #c0bfb8', borderRadius: 9, padding: '11px 18px', cursor: 'pointer', fontSize: 14, color: '#555', fontWeight: 500 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    Upload / Take photo
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
