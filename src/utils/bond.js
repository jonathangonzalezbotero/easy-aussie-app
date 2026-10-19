// Bond status vocabulary shared by Rentals, Bonds, Dashboard and Finance.
//   awaiting            bond agreed but the money has not arrived yet (bank transfer pending)
//   held                money received, liability to the customer
//   refunded            rental ended, full amount paid back
//   partially_refunded  rental ended, part paid back, the rest kept as income
//   retained            rental ended, nothing paid back
export const BOND_STATUS_LABEL = {
  awaiting: 'Awaiting payment',
  held: 'Held',
  refunded: 'Refunded',
  partially_refunded: 'Part refunded',
  retained: 'Retained',
  transferred: 'Moved to another rental',
};

export const BOND_STATUSES = Object.keys(BOND_STATUS_LABEL);

export const bondLabel = (status) => BOND_STATUS_LABEL[status] || status || '—';

export const bondVariant = (status) => {
  if (status === 'held') return 'amber';
  if (status === 'awaiting') return 'blue';
  if (status === 'refunded') return 'green';
  return 'gray';
};

export const isBondHeld = (bond) => !!bond?.amount && bond.status === 'held';
export const isBondOpen = (bond) => !!bond?.amount && (bond.status === 'held' || bond.status === 'awaiting');
export const isBondClosed = (bond) => ['refunded', 'partially_refunded', 'retained', 'transferred'].includes(bond?.status);

// A refund the rental end recorded but the bank line has not confirmed yet.
export const bondRefundPending = (bond) =>
  bond?.status === 'held' && bond.refundedAmount !== '' && bond.refundedAmount != null;

// Status to apply once a refund of `refunded` out of `amount` is final.
export const closedBondStatus = (amount, refunded) => {
  const a = Number(amount) || 0, r = Number(refunded) || 0;
  if (r <= 0) return 'retained';
  if (r >= a) return 'refunded';
  return 'partially_refunded';
};

export const BOND_RETAIN_REASONS = ['Late return fee', 'Damage', 'Unpaid rent', 'Cleaning', 'Lost accessories', 'Other'];
