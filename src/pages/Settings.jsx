import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { todayStr } from '../utils/dates';

export default function Settings() {
  const { data, updateSettings } = useStore();
  const [form, setForm]   = useState({ ...(data.settings || {}) });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await updateSettings(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  const intakeUrl = `${window.location.origin}/intake`;

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fleet-backup-${todayStr()}.json`;
    a.click();
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div style={{ maxWidth: 580, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <div className="card-head"><span className="card-title">Owner / Business Details</span></div>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>These details appear on generated rental contracts.</p>
            <div className="field"><label className="label">Company Name</label><input className="input" value={form.ownerCompany || ''} onChange={e => sf('ownerCompany', e.target.value)} /></div>
            <div className="field"><label className="label">ABN</label><input className="input" value={form.ownerABN || ''} onChange={e => sf('ownerABN', e.target.value)} /></div>
            <div className="field"><label className="label">Responsible Person</label><input className="input" value={form.ownerResponsible || ''} onChange={e => sf('ownerResponsible', e.target.value)} /></div>
            <div className="field">
              <label className="label">Default Bond Amount ($)</label>
              <input className="input" type="number" min="0" value={form.defaultBond || ''} onChange={e => sf('defaultBond', e.target.value)} />
              <span className="field-hint">Used as default when creating new rentals</span>
            </div>
            <div className="field">
              <label className="label">Insurance Excess per Claim ($)</label>
              <input className="input" type="number" min="0" value={form.insuranceExcess || ''} onChange={e => sf('insuranceExcess', e.target.value)} />
              <span className="field-hint">Shown in the contract as the amount charged to the card on file per insurance claim (scooters and cars)</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>Rental conditions shown on the public intake page and printed in the contract.</p>
            <div className="grid-2">
              <div className="field">
                <label className="label">E-bike Bond Amount ($)</label>
                <input className="input" type="number" min="0" value={form.ebikeBond || ''} onChange={e => sf('ebikeBond', e.target.value)} />
                <span className="field-hint">Default bond for e-bike rentals (scooters use the amount above)</span>
              </div>
              <div className="field">
                <label className="label">Oil Top-up Fee ($)</label>
                <input className="input" type="number" min="0" value={form.oilRefillFee || ''} onChange={e => sf('oilRefillFee', e.target.value)} />
                <span className="field-hint">Scooters only. First top-up is free</span>
              </div>
              <div className="field">
                <label className="label">Reduced Liability Cap ($)</label>
                <input className="input" type="number" min="0" value={form.reducedExcess || ''} onChange={e => sf('reducedExcess', e.target.value)} />
                <span className="field-hint">Maximum out-of-pocket per incident with the reduced option</span>
              </div>
              <div className="field">
                <label className="label">Reduced Liability Premium ($/week)</label>
                <input className="input" type="number" min="0" value={form.reducedExcessWeekly || ''} onChange={e => sf('reducedExcessWeekly', e.target.value)} />
                <span className="field-hint">For ongoing weekly rentals</span>
              </div>
              <div className="field">
                <label className="label">Reduced Liability One-off ($)</label>
                <input className="input" type="number" min="0" value={form.reducedExcessFixed || ''} onChange={e => sf('reducedExcessFixed', e.target.value)} />
                <span className="field-hint">Single charge for fixed-term rentals of a week or less</span>
              </div>
              <div className="field">
                <label className="label">E-bike Total Liability ($)</label>
                <input className="input" type="number" min="0" value={form.ebikeTotalLiability || ''} onChange={e => sf('ebikeTotalLiability', e.target.value)} />
                <span className="field-hint">What an incident costs an e-bike renter under Standard liability (bond kept + balance charged)</span>
              </div>
              <div className="field">
                <label className="label">E-bike Reduced Liability Premium ($/week)</label>
                <input className="input" type="number" min="0" value={form.ebikeReducedWeekly || ''} onChange={e => sf('ebikeReducedWeekly', e.target.value)} />
                <span className="field-hint">Caps the e-bike renter's liability at the e-bike bond</span>
              </div>
              <div className="field">
                <label className="label">E-bike Reduced Liability One-off ($)</label>
                <input className="input" type="number" min="0" value={form.ebikeReducedFixed || ''} onChange={e => sf('ebikeReducedFixed', e.target.value)} />
                <span className="field-hint">Single charge for fixed-term e-bike rentals of a week or less</span>
              </div>
            </div>
            <div>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">Customer Intake Form</span></div>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>
              Share this link with customers before their rental. They fill in their details and the record is created automatically in the Customers page.
            </p>
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontFamily: 'monospace', wordBreak: 'break-all', color: 'var(--text)' }}>
              {intakeUrl}
            </div>
            <div>
              <button className="btn btn-secondary" onClick={() => {
                navigator.clipboard.writeText(intakeUrl)
                  .then(() => alert('Intake form link copied!'))
                  .catch(() => alert('Link: ' + intakeUrl));
              }}>Copy Link</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">Data</span></div>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>Export a local backup of all your data at any time.</p>
            <div>
              <button className="btn btn-secondary" onClick={exportData}>Export Backup (JSON)</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
