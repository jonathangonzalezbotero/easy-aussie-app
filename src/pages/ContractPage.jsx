import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';

const fmtDate = (s) => {
  if (!s) return '_______________';
  return new Date(s + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
};

const Field = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
  </div>
);

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
  const isEbike  = vehicle?.type === 'ebike';
  const isCar    = vehicle?.type === 'car';

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
  };

  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  const missing = [];
  if (!d.vehicleMake)  missing.push('vehicle make');
  if (!isEbike && !d.vehicleModel) missing.push('vehicle model');
  if (!d.renterName)   missing.push('renter name');
  if (!d.startDate)    missing.push('start date');

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

  const sectionStyle      = { marginBottom: 22 };
  const sectionTitleStyle = { fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#2d8a5a', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #d0d0cc', display: 'flex', alignItems: 'center', gap: 8 };
  const numBadge          = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#2d8a5a', color: 'white', width: 20, height: 20, borderRadius: '50%', fontSize: 11, fontWeight: 700, flexShrink: 0 };
  const bodyText          = { fontSize: 13.5, lineHeight: 1.7, color: '#333' };
  const grid3             = { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px 16px' };

  const CheckItem = ({ children }) => (
    <div style={{ display: 'flex', gap: 12, marginBottom: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 20, height: 20, border: '2px solid #1a1a1a', borderRadius: 3, flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 13.5, lineHeight: 1.6, color: '#333' }}>{children}</span>
    </div>
  );

  const safetyContentScooter = (
    <div>
      <p style={{ ...bodyText, marginBottom: 12 }}>The Renter confirms they have read and agree to each of the following. Please tick and initial each item:</p>
      <CheckItem>Wear an approved helmet at all times while operating the scooter</CheckItem>
      <CheckItem>Comply with all Queensland road laws and regulations</CheckItem>
      <CheckItem>Ride only on permitted public roads</CheckItem>
      <CheckItem><strong>NOT</strong> ride on footpaths, beaches, boardwalks, bike paths, or pedestrian areas</CheckItem>
      <CheckItem>Only the named Renter will operate the scooter — no other riders permitted</CheckItem>
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #d0d0cc', display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 28 }}>Renter&apos;s Initials</div>
          <div style={{ borderBottom: '1.5px solid #1a1a1a', width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 28 }}>Date</div>
          <div style={{ borderBottom: '1.5px solid #1a1a1a', width: '100%' }} />
        </div>
      </div>
      <p style={{ ...bodyText, marginTop: 12, fontStyle: 'italic' }}>Failure to comply with any of the above constitutes a serious breach of this Agreement.</p>
    </div>
  );

  const safetyContentEbike = (
    <div>
      <p style={{ ...bodyText, marginBottom: 12 }}>The Renter confirms they have read and agree to each of the following. Please tick and initial each item:</p>
      <CheckItem>Wear an approved helmet at all times while riding the e-bike</CheckItem>
      <CheckItem>Comply with all Queensland road laws applicable to e-bikes</CheckItem>
      <CheckItem>Ride only in permitted areas — public roads, bike lanes, and shared paths</CheckItem>
      <CheckItem><strong>NOT</strong> ride on footpaths or pedestrian-only areas unless otherwise signed</CheckItem>
      <CheckItem><strong>NOT</strong> ride on beaches, boardwalks, or restricted areas</CheckItem>
      <CheckItem>Only the named Renter will operate the e-bike — no other riders permitted</CheckItem>
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #d0d0cc', display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 28 }}>Renter&apos;s Initials</div>
          <div style={{ borderBottom: '1.5px solid #1a1a1a', width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 28 }}>Date</div>
          <div style={{ borderBottom: '1.5px solid #1a1a1a', width: '100%' }} />
        </div>
      </div>
      <p style={{ ...bodyText, marginTop: 12, fontStyle: 'italic' }}>Failure to comply with any of the above constitutes a serious breach of this Agreement.</p>
    </div>
  );

  const safetyContentCar = (
    <div>
      <p style={{ ...bodyText, marginBottom: 12 }}>The Renter confirms they have read and agree to each of the following. Please tick and initial each item:</p>
      <CheckItem>Comply with all Queensland and Australian road laws at all times</CheckItem>
      <CheckItem>Use the vehicle only on sealed public roads unless otherwise agreed in writing</CheckItem>
      <CheckItem><strong>NOT</strong> drive under the influence of alcohol, drugs, or any impairing substance</CheckItem>
      <CheckItem>Wear a seatbelt and ensure all passengers do the same</CheckItem>
      <CheckItem>Report any accident, damage, theft, or incident to the Owner and Queensland Police immediately</CheckItem>
      <CheckItem>Only the named Renter will drive the vehicle — no other drivers without prior written consent</CheckItem>
      <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #d0d0cc', display: 'flex', alignItems: 'center', gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 28 }}>Renter&apos;s Initials</div>
          <div style={{ borderBottom: '1.5px solid #1a1a1a', width: '100%' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 28 }}>Date</div>
          <div style={{ borderBottom: '1.5px solid #1a1a1a', width: '100%' }} />
        </div>
      </div>
      <p style={{ ...bodyText, marginTop: 12, fontStyle: 'italic' }}>Failure to comply with any of the above constitutes a serious breach of this Agreement.</p>
    </div>
  );

  // ── Scooter sections ─────────────────────────────────────────────────────────
  const scooterSections = [
    { num: '1', title: 'Scooter Details', content: (
      <div style={grid3}>
        {[['Make and Model', [d.vehicleMake, d.vehicleModel].filter(Boolean).join(' ') || '_______________'], ['Year', d.vehicleYear || '_______________'], ['Colour', d.vehicleColour ? d.vehicleColour.toUpperCase() : '_______________'], ['Registration', d.vehicleRego || '_______________'], ['Engine Capacity', d.vehicleEngine || '_______________']].map(([l, v]) => <Field key={l} label={l} value={v} />)}
      </div>
    )},
    { num: '2', title: 'Rental Period (Weekly Basis)', content: (
      <div style={grid3}>
        {[['Start Date', fmtDate(d.startDate)], ['End Date', d.endDate ? fmtDate(d.endDate) : 'Ongoing weekly rental']].map(([l, v]) => <Field key={l} label={l} value={v} />)}
      </div>
    )},
    { num: '3', title: 'Payment & Security Bond', content: (
      <div style={bodyText}>
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
      <div style={bodyText}>
        <p style={{ marginBottom: 4 }}>The Renter declares that they:</p>
        <ul style={{ marginLeft: 20 }}>
          {['Are 18 years of age or older', 'Hold a valid Australian or international licence legally permitting them to ride a 50cc scooter in Queensland', 'Are medically fit to operate a motor vehicle', 'Only the Renter is permitted to operate the scooter'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
      </div>
    )},
    { num: '5', title: 'Fines, Tolls, Accidents & Insurance', content: (
      <div style={bodyText}>
        <div style={{ marginTop: 10 }}><strong>5.1 Traffic Fines and Tolls</strong><p>The Renter is responsible for all traffic infringements, parking fines, and toll charges during the rental period.</p></div>
        <div style={{ marginTop: 10 }}><strong>5.2 Accidents and Damage</strong><p>The Renter is responsible for any loss, damage, or theft of the moped occurring during the rental period. The Renter must immediately notify the Owner and, if applicable, the police of any accident, theft, or incident. Rental fees continue until the moped is repaired or replaced.</p></div>
        <div style={{ marginTop: 10 }}><strong>5.3 Insurance</strong><p>The moped is covered by CTP insurance as required by Queensland law. CTP does not cover damage to the moped, damage to third-party property, or personal injury to the Renter. The Renter remains fully liable for any damage or loss not covered by CTP.</p></div>
      </div>
    )},
    { num: '7', title: 'Condition of the Scooter', content: (
      <div style={bodyText}>
        <p><strong>At the Start:</strong> The Owner confirms the moped is in good working and roadworthy condition.</p>
        <div style={{ border: '1px solid #d0d0cc', borderRadius: 8, padding: '12px 14px', margin: '8px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Existing damage (if any)</div>
          <div style={{ fontSize: 13.5, minHeight: 28, color: d.vehicleCondition ? '#c05000' : '#999' }}>{d.vehicleCondition || 'None'}</div>
        </div>
        <p><strong>At the End:</strong> The Renter must return the moped in the same condition, except for fair wear and tear, and with the same level of fuel.</p>
      </div>
    )},
    { num: '8',  title: 'Prohibited Uses', content: (
      <div style={bodyText}>
        <p style={{ marginBottom: 4 }}>The moped must not be used for:</p>
        <ul style={{ marginLeft: 20 }}>
          {['Racing or competition', 'Carrying more passengers than designed', 'Towing other vehicles or trailers', 'Off-road or beach riding', 'Operation under the influence of alcohol or drugs'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
      </div>
    )},
    { num: '9',  title: 'Insurance Included',               content: <p style={bodyText}>The rental price includes comprehensive insurance, subject to the terms, limitations, and exclusions outlined in this Agreement. The included insurance includes CTP as required by Queensland law and limited damage protection.</p> },
    { num: '10', title: 'Insurance Limitations & Exclusions', content: <p style={bodyText}>The included insurance does NOT cover: theft, loss, or total write-off; damage caused by reckless or illegal use; riding under the influence; riding outside permitted areas; mechanical damage caused by misuse; personal injury to the Renter; damage to personal property; fines, penalties, towing, or recovery costs; or loss of use.</p> },
    { num: '11', title: 'Personal Insurance Recommendation', content: <p style={bodyText}>Easy Aussie AU Pty Ltd strongly recommends the Renter holds personal travel insurance and personal health or accident insurance. The Renter acknowledges the included insurance does not cover personal injury, medical costs, or loss of personal belongings.</p> },
    { num: '12', title: 'Assumption of Risk',               content: <p style={bodyText}>The Renter acknowledges that riding a scooter involves inherent risks, including serious injury or death. The Renter voluntarily accepts all risks, whether foreseeable or not.</p> },
    { num: '13', title: 'Indemnity',                        content: <p style={bodyText}>The Renter agrees to indemnify and hold harmless the Owner from any claim, loss, or expense (including legal costs) arising out of the Renter's use of the scooter, except where caused by the Owner's negligence or breach of this Agreement.</p> },
    { num: '14', title: 'Safety & Road Rules — Renter Acknowledgement', content: safetyContentScooter },
    { num: '15', title: 'Governing Law',                    content: <p style={bodyText}>This Agreement is governed by the laws of Queensland, Australia. Any disputes will be resolved through appropriate legal channels within Queensland.</p> },
  ];

  // ── E-bike sections ──────────────────────────────────────────────────────────
  const ebikeSections = [
    { num: '1', title: 'E-Bike Details', content: (
      <div style={grid3}>
        {[['Make', d.vehicleMake || '_______________'], ['Year', d.vehicleYear || '_______________'], ['Colour', d.vehicleColour ? d.vehicleColour.toUpperCase() : '_______________'], ['Registration / ID', d.vehicleRego || '_______________']].map(([l, v]) => <Field key={l} label={l} value={v} />)}
      </div>
    )},
    { num: '2', title: 'Rental Period (Weekly Basis)', content: (
      <div style={grid3}>
        {[['Start Date', fmtDate(d.startDate)], ['End Date', d.endDate ? fmtDate(d.endDate) : 'Ongoing weekly rental']].map(([l, v]) => <Field key={l} label={l} value={v} />)}
      </div>
    )},
    { num: '3', title: 'Payment & Security Bond', content: (
      <div style={bodyText}>
        <p style={{ marginBottom: 8 }}>Rental fees must be paid prior to e-bike handover.</p>
        <p style={{ marginBottom: 8 }}>A refundable security bond of <strong>${d.bondAmount} AUD</strong> is required.</p>
        <p style={{ marginBottom: 4 }}>The bond may be used to cover:</p>
        <ul style={{ marginLeft: 20, marginBottom: 8 }}>
          {['Damage, loss, or theft of the e-bike or accessories', 'Traffic fines or penalties incurred during the rental', 'Late return or recovery costs', 'Cleaning costs where the e-bike is returned in an unacceptable condition'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
        <p>Bond refunds are processed after inspection and may take up to 24 hours.</p>
      </div>
    )},
    { num: '4', title: 'Eligibility', content: (
      <div style={bodyText}>
        <p style={{ marginBottom: 4 }}>The Renter declares that they:</p>
        <ul style={{ marginLeft: 20 }}>
          {['Are 18 years of age or older', 'Are medically fit to ride an e-bike', 'Only the Renter is permitted to operate the e-bike', 'Understand that no motor vehicle licence is required to ride this e-bike under Queensland law'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
      </div>
    )},
    { num: '5', title: 'Fines, Accidents & Damage', content: (
      <div style={bodyText}>
        <div style={{ marginTop: 10 }}><strong>5.1 Traffic Fines and Penalties</strong><p>The Renter is responsible for all traffic infringements, fines, and penalties incurred during the rental period.</p></div>
        <div style={{ marginTop: 10 }}><strong>5.2 Accidents and Damage</strong><p>The Renter is responsible for any loss, damage, or theft of the e-bike or its accessories occurring during the rental period. The Renter must immediately notify the Owner and, where applicable, the police of any accident, theft, or incident. Rental fees continue until the e-bike is repaired or replaced.</p></div>
        <div style={{ marginTop: 10 }}><strong>5.3 Battery and Charging</strong><p>The Renter must not attempt to modify, tamper with, or use third-party chargers on the e-bike battery. Damage resulting from improper charging or battery misuse is the Renter's full financial responsibility.</p></div>
      </div>
    )},
    { num: '7', title: 'Condition of the E-Bike', content: (
      <div style={bodyText}>
        <p><strong>At the Start:</strong> The Owner confirms the e-bike is in good working condition with a charged battery and all accessories present.</p>
        <div style={{ border: '1px solid #d0d0cc', borderRadius: 8, padding: '12px 14px', margin: '8px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Existing damage (if any)</div>
          <div style={{ fontSize: 13.5, minHeight: 28, color: d.vehicleCondition ? '#c05000' : '#999' }}>{d.vehicleCondition || 'None'}</div>
        </div>
        <p><strong>At the End:</strong> The Renter must return the e-bike in the same condition, with the battery at a reasonable charge level and all accessories intact.</p>
      </div>
    )},
    { num: '8', title: 'Prohibited Uses', content: (
      <div style={bodyText}>
        <p style={{ marginBottom: 4 }}>The e-bike must not be used for:</p>
        <ul style={{ marginLeft: 20 }}>
          {['Racing, competition, or stunt riding', 'Carrying more than one rider', 'Towing other vehicles or trailers', 'Off-road, beach, or trail riding', 'Operation under the influence of alcohol or drugs', 'Any modification or tampering with the motor, battery, or controls'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
      </div>
    )},
    { num: '9', title: 'Liability & Insurance', content: (
      <div style={bodyText}>
        <p style={{ marginBottom: 8 }}>This e-bike is not a registered motor vehicle and is not covered by Compulsory Third Party (CTP) insurance.</p>
        <p style={{ marginBottom: 8 }}>The Renter acknowledges that:</p>
        <ul style={{ marginLeft: 20, marginBottom: 8 }}>
          {['No registration or CTP is applicable to this e-bike', 'The security bond is the primary mechanism for recovering costs from damage or loss', 'The Renter is fully liable for any damage to third-party property or injury caused by the Renter\'s use of the e-bike', 'The Owner holds no liability for personal injury to the Renter'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
        <p>Easy Aussie AU Pty Ltd strongly recommends the Renter holds personal travel or accident insurance for the duration of the rental.</p>
      </div>
    )},
    { num: '10', title: 'Assumption of Risk', content: <p style={bodyText}>The Renter acknowledges that riding an e-bike involves inherent risks, including serious injury or death. The Renter voluntarily accepts all risks associated with the use of the e-bike, whether foreseeable or not.</p> },
    { num: '11', title: 'Indemnity',          content: <p style={bodyText}>The Renter agrees to indemnify and hold harmless the Owner from any claim, loss, or expense (including legal costs) arising out of the Renter's use of the e-bike, except where caused by the Owner's negligence or breach of this Agreement.</p> },
    { num: '12', title: 'Safety & Road Rules — Renter Acknowledgement', content: safetyContentEbike },
    { num: '13', title: 'Governing Law',      content: <p style={bodyText}>This Agreement is governed by the laws of Queensland, Australia. Any disputes will be resolved through appropriate legal channels within Queensland.</p> },
  ];

  // ── Car sections ────────────────────────────────────────────────────────────
  const carSections = [
    { num: '1', title: 'Vehicle Details', content: (
      <div style={grid3}>
        {[['Make', d.vehicleMake || '_______________'], ['Model', d.vehicleModel || '_______________'], ['Year', d.vehicleYear || '_______________'], ['Colour', d.vehicleColour ? d.vehicleColour.toUpperCase() : '_______________'], ['Registration', d.vehicleRego || '_______________'], ['Engine Capacity', d.vehicleEngine || '_______________'], ...(d.odometer ? [['Odometer at Start', d.odometer + ' km']] : [])].map(([l, v]) => <Field key={l} label={l} value={v} />)}
      </div>
    )},
    { num: '2', title: 'Rental Period', content: (
      <div style={grid3}>
        {[['Start Date', fmtDate(d.startDate)], ['End Date', d.endDate ? fmtDate(d.endDate) : 'Ongoing weekly rental']].map(([l, v]) => <Field key={l} label={l} value={v} />)}
      </div>
    )},
    { num: '3', title: 'Payment & Security Bond', content: (
      <div style={bodyText}>
        <p style={{ marginBottom: 8 }}>Rental fees must be paid before vehicle key handover.</p>
        <p style={{ marginBottom: 8 }}>A refundable security bond of <strong>${d.bondAmount} AUD</strong> is required.</p>
        <p style={{ marginBottom: 4 }}>The bond may be used to cover:</p>
        <ul style={{ marginLeft: 20, marginBottom: 8 }}>
          {['Insurance excess', 'Damage, loss, or theft of the vehicle', 'Traffic fines, tolls, or penalties', 'Late return, cleaning, refuelling, or recovery costs'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
        <p>Bond refunds are processed after inspection to check for damage and outstanding fines, and may take up to 24 hours.</p>
      </div>
    )},
    { num: '4', title: 'Licensing & Eligibility', content: (
      <div style={bodyText}>
        <p style={{ marginBottom: 4 }}>The Renter declares that they:</p>
        <ul style={{ marginLeft: 20 }}>
          {['Are 18 years of age or older', 'Hold a valid full Australian or international driving licence permitting them to drive this vehicle in Queensland', 'Are medically fit to operate a motor vehicle', 'Will not permit any other person to drive the vehicle without prior written consent from the Owner'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
      </div>
    )},
    { num: '5', title: 'Fuel Policy', content: (
      <div style={bodyText}>
        <p style={{ marginBottom: 8 }}>The vehicle will be provided with a full tank of fuel. The Renter must return the vehicle with the same level of fuel.</p>
        <p>If the vehicle is returned with less fuel, the Owner will charge the Renter for the cost of refuelling at current market rates plus a <strong>$20 AUD</strong> refuelling service fee, to be deducted from the bond.</p>
      </div>
    )},
    { num: '7', title: 'Fines, Tolls, Accidents & Insurance', content: (
      <div style={bodyText}>
        <div style={{ marginTop: 10 }}><strong>6.1 Traffic Fines and Tolls</strong><p>The Renter is solely responsible for all traffic infringements, parking fines, and toll charges incurred during the rental period.</p></div>
        <div style={{ marginTop: 10 }}><strong>6.2 Accidents and Damage</strong><p>The Renter is responsible for any loss, damage, or theft of the vehicle occurring during the rental period. The Renter must immediately notify the Owner and, if applicable, Queensland Police. Rental fees continue until the vehicle is repaired or replaced.</p></div>
        <div style={{ marginTop: 10 }}><strong>6.3 CTP Insurance</strong><p>The vehicle is covered by Compulsory Third Party (CTP) insurance as required by Queensland law. CTP covers personal injury to third parties only and does not cover damage to the vehicle, damage to third-party property, or personal injury to the Renter.</p></div>
        <div style={{ marginTop: 10 }}><strong>6.4 Additional Insurance</strong><p>The Renter remains fully liable for any damage or loss not covered by CTP. The Owner strongly recommends the Renter arrange their own comprehensive vehicle or travel insurance for the duration of the rental.</p></div>
      </div>
    )},
    { num: '8', title: 'Condition of the Vehicle', content: (
      <div style={bodyText}>
        <p><strong>At the Start:</strong> The Owner confirms the vehicle is in good working and roadworthy condition.</p>
        <div style={{ border: '1px solid #d0d0cc', borderRadius: 8, padding: '12px 14px', margin: '8px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Existing damage (if any)</div>
          <div style={{ fontSize: 13.5, minHeight: 28, color: d.vehicleCondition ? '#c05000' : '#999' }}>{d.vehicleCondition || 'None'}</div>
        </div>
        <p><strong>At the End:</strong> The Renter must return the vehicle in the same condition, except for fair wear and tear, with a full tank of fuel and all accessories present.</p>
      </div>
    )},
    { num: '9', title: 'Prohibited Uses', content: (
      <div style={bodyText}>
        <p style={{ marginBottom: 4 }}>The vehicle must not be used for:</p>
        <ul style={{ marginLeft: 20 }}>
          {['Driving on unsealed, off-road, or beach terrain unless specifically authorised in writing', 'Racing, rallying, or any competitive event', 'Towing or pushing another vehicle', 'Carrying more passengers than the vehicle is legally designed for', 'Commercial purposes, ride-sharing, or sub-letting', 'Operation under the influence of alcohol or drugs', 'Any illegal activity'].map(i => <li key={i} style={{ marginBottom: 4 }}>{i}</li>)}
        </ul>
      </div>
    )},
    { num: '10', title: 'Insurance Limitations & Exclusions', content: <p style={bodyText}>Insurance does NOT cover: theft or total write-off caused by negligence or unlocked vehicle; damage from prohibited use or illegal driving; driving under the influence; off-road use; mechanical damage caused by misuse; personal injury to the Renter or passengers; damage to personal property; fines, penalties, towing, or recovery costs; or loss of use.</p> },
    { num: '11', title: 'Personal Insurance Recommendation', content: <p style={bodyText}>Easy Aussie AU Pty Ltd strongly recommends the Renter holds personal travel insurance and/or comprehensive vehicle insurance. The Renter acknowledges that the included CTP does not cover damage to the vehicle or personal injury to the Renter.</p> },
    { num: '12', title: 'Assumption of Risk',  content: <p style={bodyText}>The Renter acknowledges that driving a motor vehicle involves inherent risks. The Renter voluntarily accepts all risks associated with the use of the vehicle, whether foreseeable or not.</p> },
    { num: '13', title: 'Indemnity',           content: <p style={bodyText}>The Renter agrees to indemnify and hold harmless the Owner from any claim, loss, or expense (including legal costs) arising out of the Renter's use of the vehicle, except where caused by the Owner's negligence or breach of this Agreement.</p> },
    { num: '14', title: 'Driver Responsibilities — Renter Acknowledgement', content: safetyContentCar },
    { num: '15', title: 'Governing Law',       content: <p style={bodyText}>This Agreement is governed by the laws of Queensland, Australia. Any disputes will be resolved through appropriate legal channels within Queensland.</p> },
  ];

  const sections      = isCar ? carSections : isEbike ? ebikeSections : scooterSections;
  const signaturesNum = sections.length + 1;

  const agreementType = isCar ? 'Car Rental Agreement' : isEbike ? 'E-Bike Rental Agreement' : 'Scooter Rental Agreement';

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
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Back</button>
          <button className="btn btn-primary" onClick={downloadPDF} disabled={downloading}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            {downloading ? 'Generating PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Contract body */}
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
            <div style={{ fontSize: 16, fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{agreementType}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, fontSize: 14 }}>
              <span>Date: <strong>{today}</strong></span>
              {d.contractNumber && <span>Contract No.: <strong>{d.contractNumber}</strong></span>}
            </div>
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
          {sections.map((s, i) => (
            <div key={s.title} style={sectionStyle}>
              <div style={sectionTitleStyle}>
                <span style={numBadge}>{i + 1}</span>
                {s.title}
              </div>
              {s.content}
            </div>
          ))}

          {/* Signatures */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>
              <span style={numBadge}>{signaturesNum}</span>
              Signatures
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.7, color: '#333', marginBottom: 24 }}>
              By signing this Agreement, the Renter confirms that they have read and understood all terms, accept financial responsibility where applicable, and agree to comply with all relevant Queensland road laws and regulations.
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
