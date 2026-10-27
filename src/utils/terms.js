// Rental conditions shown on the public intake page before the form, and
// mirrored in the contract so the two can never drift apart.
// Bump TERMS_VERSION whenever the wording or amounts change meaningfully;
// the version a customer accepted is stored on their record.

export const TERMS_VERSION = '2026-10';

export const DEFAULT_TERMS_AMOUNTS = {
  defaultBond: '300',
  insuranceExcess: '700',
  ebikeBond: '150',
  oilRefillFee: '5',
  reducedExcess: '300',
  reducedExcessWeekly: '10',
  reducedExcessFixed: '30',
  ebikeTotalLiability: '600',
  ebikeReducedWeekly: '10',
};

// Map a raw snake_case settings row (public intake / signing page) to the camelCase
// amounts above, with defaults for anything missing.
export function termsAmountsFromRow(row) {
  const r = row || {};
  return {
    defaultBond:         r.default_bond          || DEFAULT_TERMS_AMOUNTS.defaultBond,
    insuranceExcess:     r.insurance_excess      || DEFAULT_TERMS_AMOUNTS.insuranceExcess,
    ebikeBond:           r.ebike_bond            || DEFAULT_TERMS_AMOUNTS.ebikeBond,
    oilRefillFee:        r.oil_refill_fee        || DEFAULT_TERMS_AMOUNTS.oilRefillFee,
    reducedExcess:       r.reduced_excess        || DEFAULT_TERMS_AMOUNTS.reducedExcess,
    reducedExcessWeekly: r.reduced_excess_weekly || DEFAULT_TERMS_AMOUNTS.reducedExcessWeekly,
    reducedExcessFixed:  r.reduced_excess_fixed  || DEFAULT_TERMS_AMOUNTS.reducedExcessFixed,
    ebikeTotalLiability: r.ebike_total_liability || DEFAULT_TERMS_AMOUNTS.ebikeTotalLiability,
    ebikeReducedWeekly:  r.ebike_reduced_weekly  || DEFAULT_TERMS_AMOUNTS.ebikeReducedWeekly,
  };
}

// Same, from the camelCase settings object in StoreContext.
export function termsAmountsFromSettings(s) {
  const x = s || {};
  return {
    defaultBond:         x.defaultBond         || DEFAULT_TERMS_AMOUNTS.defaultBond,
    insuranceExcess:     x.insuranceExcess     || DEFAULT_TERMS_AMOUNTS.insuranceExcess,
    ebikeBond:           x.ebikeBond           || DEFAULT_TERMS_AMOUNTS.ebikeBond,
    oilRefillFee:        x.oilRefillFee        || DEFAULT_TERMS_AMOUNTS.oilRefillFee,
    reducedExcess:       x.reducedExcess       || DEFAULT_TERMS_AMOUNTS.reducedExcess,
    reducedExcessWeekly: x.reducedExcessWeekly || DEFAULT_TERMS_AMOUNTS.reducedExcessWeekly,
    reducedExcessFixed:  x.reducedExcessFixed  || DEFAULT_TERMS_AMOUNTS.reducedExcessFixed,
    ebikeTotalLiability: x.ebikeTotalLiability || DEFAULT_TERMS_AMOUNTS.ebikeTotalLiability,
    ebikeReducedWeekly:  x.ebikeReducedWeekly  || DEFAULT_TERMS_AMOUNTS.ebikeReducedWeekly,
  };
}

// Things that void the reduced-liability option (and the bond cap generally).
export const COVER_EXCLUSIONS = [
  'riding without an approved helmet',
  'riding under the influence of alcohol or drugs',
  'carrying a passenger',
  'reckless, illegal or off-road use',
  'an accident or theft not reported to the Owner immediately',
  'theft where the vehicle was left unlocked or with the keys in it',
];

// Liability figures for a vehicle type.
//   total  — what an incident costs the renter under Standard liability (bond kept + balance charged)
//   cap    — maximum out-of-pocket under Reduced liability (the bond)
//   weekly — Reduced liability premium per week; fixed — one-off premium for short rentals (null = not offered)
export function liabilityFor(a, vehicleType) {
  if (vehicleType === 'ebike') {
    return { bond: a.ebikeBond, total: Number(a.ebikeTotalLiability || 0), cap: Number(a.ebikeBond || 0), weekly: a.ebikeReducedWeekly, fixed: null, noun: 'e-bike', hasExcess: false };
  }
  return { bond: a.defaultBond, total: Number(a.defaultBond || 0) + Number(a.insuranceExcess || 0), cap: Number(a.reducedExcess || 0), weekly: a.reducedExcessWeekly, fixed: a.reducedExcessFixed, noun: 'scooter', hasExcess: true };
}

// Premium wording for a rental: weekly rentals pay per week, fixed-term (1 day to 1 week) pay once where offered.
export const reducedPremiumText = (a, billingPeriod, vehicleType) => {
  const L = liabilityFor(a, vehicleType);
  return billingPeriod === 'fixed' && L.fixed ? `$${L.fixed} one-off` : `$${L.weekly} per week`;
};

export const totalLiability = (a, vehicleType) => liabilityFor(a, vehicleType).total;

// Insurance option labels + one-line descriptions, for intake and the rentals page.
export function insuranceOptions(a, vehicleType) {
  const L = liabilityFor(a, vehicleType);
  const premium = L.fixed ? `+$${L.weekly}/week, or $${L.fixed} one-off for a week or less` : `+$${L.weekly}/week`;
  return [
    {
      value: 'standard',
      label: `Standard liability ($${L.total} per incident)`,
      short: 'No extra charge',
      text: `If there is an accident${L.hasExcess ? '' : ', damage or theft'} it will cost you $${L.total} in total. Your $${L.bond} bond is kept and the balance is charged to your card on file.`,
    },
    {
      value: 'reduced',
      label: `Reduced liability (${premium})`,
      short: premium,
      text: `Your maximum out-of-pocket per incident is capped at $${L.cap}. Nothing is charged on top of your bond${L.hasExcess ? ', for both damage to the scooter and the insurance excess' : ''}.`,
    },
  ];
}

// The list of conditions a customer must accept, tailored to the vehicle type.
// Each item is { title, body } where body is plain text (may contain newlines).
export function termsFor(vehicleType, a) {
  const isEbike = vehicleType === 'ebike';
  const L = liabilityFor(a, vehicleType);
  const items = [];

  if (!isEbike) {
    items.push({
      title: 'Security bond',
      body: `A refundable bond of $${a.defaultBond} is paid before pick-up. The bond is refunded within 24 hours of the scooter being returned and inspected, less any fines, damage, cleaning or late-return costs.`,
    });
    items.push({
      title: 'Accidents and insurance',
      body: `The scooter has Compulsory Third Party (CTP) and third-party property insurance. It is not comprehensively insured. If there is an accident you are responsible for the insurance excess and for damage to the scooter itself.\n\nYou can choose below how this is handled:\n• Standard liability: an accident will cost you $${L.total} in total. Your $${L.bond} bond is kept and the balance is charged to your card on file.\n• Reduced liability: $${L.weekly} extra per week for ongoing rentals, or a one-off $${L.fixed} for rentals of a week or less. Your maximum out-of-pocket per incident is capped at $${L.cap}. Nothing is charged on top of your bond.\n\nNeither option applies to ${COVER_EXCLUSIONS.join(', ')}. In those cases you are liable for the full cost.`,
    });
    items.push({
      title: 'Fuel and engine oil',
      body: `Return the scooter with the same level of fuel it had at pick-up. The scooter also needs engine (2-stroke) oil top-ups. The first top-up is free; each one after that is $${a.oilRefillFee}. Never ride with the oil light on, as engine damage from running dry is charged to you.`,
    });
  } else {
    items.push({
      title: 'Security bond',
      body: `A refundable bond of $${a.ebikeBond} is paid before pick-up. The bond is refunded within 24 hours of the e-bike being returned and inspected, less any damage, cleaning or late-return costs.`,
    });
    items.push({
      title: 'Accidents and damage',
      body: `The e-bike is not a registered motor vehicle and has no insurance. You are responsible for any loss, damage or theft of the e-bike and its accessories while it is in your care, and for any damage you cause to other people or their property.\n\nYou can choose below how this is handled:\n• Standard liability: an accident, damage or theft will cost you $${L.total} in total. Your $${L.bond} bond is kept and the balance is charged to your card on file.\n• Reduced liability: $${L.weekly} extra per week. Your maximum out-of-pocket per incident is capped at $${L.cap}. Nothing is charged on top of your bond.\n\nNeither option applies to ${COVER_EXCLUSIONS.join(', ')}. In those cases you are liable for the full cost.`,
    });
    items.push({
      title: 'Battery and charging',
      body: 'Charge the e-bike only with the charger supplied. Do not modify or tamper with the battery. Damage from improper charging is your responsibility.',
    });
  }

  return items;
}
