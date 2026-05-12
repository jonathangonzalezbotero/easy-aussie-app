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

export default function ContractDocument({ d, isEbike, isCar, contractRef = null, ownerSignature = true }) {
  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  const missing = [];
  if (!d.vehicleMake)  missing.push('vehicle make');
  if (!isEbike && !d.vehicleModel) missing.push('vehicle model');
  if (!d.renterName)   missing.push('renter name');
  if (!d.startDate)    missing.push('start date');

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
        <div style={{ marginTop: 10 }}><strong>5.3 Insurance</strong><p>The moped is covered by <strong>Compulsory Third Party (CTP)</strong> insurance, which covers bodily injury to other people, and <strong>Third Party Property Damage</strong> insurance, which covers damage to other people's property caused by the Renter. Neither policy covers damage to or theft of the moped itself. The Renter remains fully liable for any loss or damage to the moped.</p></div>
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
    { num: '9',  title: 'Insurance Cover Provided', content: (
      <div style={bodyText}>
        <p style={{ marginBottom: 8 }}>The following insurance cover is included with this rental:</p>
        <ul style={{ marginLeft: 20, marginBottom: 8 }}>
          <li style={{ marginBottom: 6 }}><strong>Compulsory Third Party (CTP):</strong> Covers bodily injury to other people caused by the Renter's use of the moped, as required by Queensland law.</li>
          <li style={{ marginBottom: 6 }}><strong>Third Party Property Damage:</strong> Covers damage caused to other people's property (e.g. another vehicle, a fence) as a result of an accident.</li>
        </ul>
        <p><strong>No comprehensive insurance is included.</strong> The Renter is fully liable for any damage to, or theft of, the moped itself.</p>
      </div>
    )},
    { num: '10', title: 'Insurance Exclusions',              content: <p style={bodyText}>The included insurance does NOT cover: damage to or theft of the moped; personal injury to the Renter; damage caused by reckless or illegal use; riding under the influence of alcohol or drugs; riding outside permitted areas; mechanical damage caused by misuse; traffic fines, penalties, towing, or recovery costs; or loss of use of the vehicle.</p> },
    { num: '11', title: 'Personal Insurance Recommendation', content: <p style={bodyText}>Easy Aussie AU Pty Ltd strongly recommends the Renter holds personal travel insurance and personal accident or health insurance. As no comprehensive vehicle insurance is provided, the Renter is solely responsible for the cost of repairing or replacing the moped in the event of damage or theft.</p> },
    { num: '12', title: 'Assumption of Risk',               content: <p style={bodyText}>The Renter acknowledges that riding a scooter involves inherent risks, including serious injury or death. The Renter voluntarily accepts all risks, whether foreseeable or not.</p> },
    { num: '13', title: 'Indemnity',                        content: <p style={bodyText}>The Renter agrees to indemnify and hold harmless the Owner from any claim, loss, or expense (including legal costs) arising out of the Renter's use of the scooter, except where caused by the Owner's negligence or breach of this Agreement.</p> },
    { num: '14', title: 'Safety & Road Rules — Renter Acknowledgement', content: safetyContentScooter },
    { num: '15', title: 'Governing Law',                    content: <p style={bodyText}>This Agreement is governed by the laws of Queensland, Australia. Any disputes will be resolved through appropriate legal channels within Queensland.</p> },
  ];

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
        <div style={{ marginTop: 10 }}><strong>6.3 Insurance Cover Provided</strong><p>The following insurance is included with this rental: <strong>Compulsory Third Party (CTP)</strong> — covers bodily injury to other people as required by Queensland law; and <strong>Third Party Property Damage</strong> — covers damage caused to other people's property (e.g. another vehicle) in an accident. <strong>No comprehensive insurance is included.</strong> The Renter is fully liable for any damage to or theft of the rental vehicle itself.</p></div>
        <div style={{ marginTop: 10 }}><strong>6.4 Renter's Liability</strong><p>The Renter is fully liable for the cost of repairing or replacing the vehicle in the event of damage or theft not covered by the included insurance. The Owner strongly recommends the Renter arrange their own comprehensive vehicle or travel insurance before taking possession of the vehicle.</p></div>
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
    { num: '10', title: 'Insurance Exclusions',              content: <p style={bodyText}>The included insurance does NOT cover: damage to or theft of the rental vehicle; personal injury to the Renter or passengers; damage caused by prohibited use or illegal driving; driving under the influence of alcohol or drugs; off-road use; mechanical damage caused by misuse; traffic fines, penalties, towing, or recovery costs; or loss of use of the vehicle.</p> },
    { num: '11', title: 'Personal Insurance Recommendation', content: <p style={bodyText}>Easy Aussie AU Pty Ltd strongly recommends the Renter holds personal travel insurance and/or comprehensive vehicle insurance. As no comprehensive vehicle insurance is provided, the Renter is solely responsible for the cost of repairing or replacing the vehicle in the event of damage or theft.</p> },
    { num: '12', title: 'Assumption of Risk',  content: <p style={bodyText}>The Renter acknowledges that driving a motor vehicle involves inherent risks. The Renter voluntarily accepts all risks associated with the use of the vehicle, whether foreseeable or not.</p> },
    { num: '13', title: 'Indemnity',           content: <p style={bodyText}>The Renter agrees to indemnify and hold harmless the Owner from any claim, loss, or expense (including legal costs) arising out of the Renter's use of the vehicle, except where caused by the Owner's negligence or breach of this Agreement.</p> },
    { num: '14', title: 'Driver Responsibilities — Renter Acknowledgement', content: safetyContentCar },
    { num: '15', title: 'Governing Law',       content: <p style={bodyText}>This Agreement is governed by the laws of Queensland, Australia. Any disputes will be resolved through appropriate legal channels within Queensland.</p> },
  ];

  const sections      = isCar ? carSections : isEbike ? ebikeSections : scooterSections;
  const signaturesNum = sections.length + 1;
  const agreementType = isCar ? 'Car Rental Agreement' : isEbike ? 'E-Bike Rental Agreement' : 'Scooter Rental Agreement';

  return (
    <div ref={contractRef} style={{ background: 'white', borderRadius: 12, padding: '48px 56px', boxShadow: '0 2px 20px rgba(0,0,0,0.06)', fontFamily: "'DM Sans', sans-serif" }}>

      {missing.length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #d97706', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#92400e', marginBottom: 20, fontWeight: 500 }}>
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
          {/* Owner */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Owner</div>
            <div style={{ height: 80, display: 'flex', alignItems: 'flex-end' }}>
              {ownerSignature && (
                <div style={{ width: 220, height: 75, overflow: 'hidden', position: 'relative' }}>
                  <img src="/signature.jpg" alt="Owner signature" style={{ height: 220, width: 75, objectFit: 'contain', position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg) translateX(-100%)', transformOrigin: 'left top' }} />
                </div>
              )}
            </div>
            <div style={{ borderBottom: '1.5px solid #1a1a1a', marginBottom: 6 }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>{d.ownerCompany}</div>
            {d.ownerResponsible && <div style={{ fontSize: 12, color: '#666' }}>{d.ownerResponsible}</div>}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Date</div>
              <div style={{ borderBottom: '1.5px solid #1a1a1a', width: 120 }} />
            </div>
          </div>
          {/* Renter */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Renter</div>
            <div style={{ height: 80, display: 'flex', alignItems: 'flex-end' }}>
              {d.renterSignedName ? (
                <div>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: 26, color: '#1a1a1a', letterSpacing: '0.02em', marginBottom: 2 }}>{d.renterSignedName}</div>
                  {d.renterSignedAt && <div style={{ fontSize: 11, color: '#999' }}>Signed electronically {new Date(d.renterSignedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>}
                </div>
              ) : null}
            </div>
            <div style={{ borderBottom: '1.5px solid #1a1a1a', marginBottom: 6 }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>{d.renterName}</div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Date</div>
              <div style={{ borderBottom: '1.5px solid #1a1a1a', width: 120 }} />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
