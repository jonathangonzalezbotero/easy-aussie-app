// Turns a transaction edit into the payload for finance_confirm, including the rental
// bond side effect, so the drawer and the reconcile queue behave the same way.
import { toCents } from './categories';
import { closedBondStatus } from '../utils/bond';

// form: { category, splits (array or []), customerId, rentalId, vehicleId, linkedTransactionId, notes, refundMode }
export function buildConfirm(tx, form, { rentals }) {
  const lines = form.splits?.length ? form.splits : [{ category: form.category, amount: tx.amount, rentalId: form.rentalId, customerId: form.customerId, vehicleId: form.vehicleId }];
  const effects = [];
  let rentalId = null, rentalUpdates = null;

  const deposit = lines.find(l => l.category === 'bond_deposit' && (l.rentalId || form.rentalId));
  const refund  = lines.find(l => l.category === 'bond_refund' && (l.rentalId || form.rentalId));
  const retained = lines.filter(l => l.category === 'bond_retained').reduce((s, l) => s + toCents(l.amount), 0);

  if (deposit) {
    const rental = rentals.find(r => r.id === (deposit.rentalId || form.rentalId));
    if (rental) {
      const received = toCents(deposit.amount);
      const bondAmt = rental.bond?.amount ? toCents(rental.bond.amount) : received;
      rentalId = rental.id;
      rentalUpdates = { status: 'held', amount: bondAmt / 100 };
      if (received !== bondAmt) rentalUpdates.amount = received / 100;
      effects.push(`Rental ${rental.contractNumber || ''} bond: ${rental.bond?.status === 'held' ? 'Held' : 'Awaiting payment'} → Held $${received / 100}${received !== bondAmt ? ` (was $${bondAmt / 100} on the rental)` : ''}`);
    }
  } else if (refund) {
    const rental = rentals.find(r => r.id === (refund.rentalId || form.rentalId));
    if (rental) {
      const bondAmt = toCents(rental.bond?.amount);
      const out = Math.abs(toCents(refund.amount));
      rentalId = rental.id;
      if (form.refundMode === 'pending' && out < bondAmt) {
        // Part refunded now, the rest still owed to the customer
        rentalUpdates = { status: 'held', amount: (bondAmt - out) / 100, refundedAmount: null, retainedAmount: null, refundMethod: 'bank', refundDate: tx.date };
        effects.push(`Rental ${rental.contractNumber || ''} bond: Held $${bondAmt / 100} → Held $${(bondAmt - out) / 100} still to pay back`);
      } else {
        // The refund line is the full bond leaving (if split) or the amount paid back; kept = bond − paid back
        const paidBack = form.splits?.length ? bondAmt - retained : out;
        const kept = bondAmt - paidBack;
        rentalUpdates = { status: closedBondStatus(bondAmt / 100, paidBack / 100), refundedAmount: paidBack / 100, retainedAmount: kept / 100, refundMethod: 'bank', refundDate: tx.date, retainReason: kept > 0 ? (form.retainReason || rental.bond?.retainReason || 'Retained on refund') : rental.bond?.retainReason || null };
        effects.push(`Rental ${rental.contractNumber || ''} bond: Held $${bondAmt / 100} → ${kept > 0 ? `Refunded $${paidBack / 100} · $${kept / 100} retained` : `Refunded $${paidBack / 100}`}`);
        if (kept > 0) effects.push(`Income: +$${kept / 100} under Bond retained`);
      }
    }
  }
  if (form.linkedTransactionId && form.category === 'reimbursement') effects.push('Pairs with the personal-card expense; the expense keeps its original date');
  if (form.category === 'stripe_payout') effects.push('Transfer only: nothing is added to income');

  return {
    id: tx.id,
    updates: { category: form.category || (form.splits?.length ? 'split' : ''), customerId: form.customerId || null, rentalId: form.rentalId || null, vehicleId: form.vehicleId || null, payeeId: form.payeeId || null, linkedTransactionId: form.linkedTransactionId || null, notes: form.notes || '', matchStatus: 'confirmed' },
    splits: form.splits?.length ? form.splits : [],
    rentalId, rentalUpdates, effects,
  };
}

// Splits must add up to the transaction amount, in cents.
export const splitRemainder = (tx, splits) => toCents(tx.amount) - splits.reduce((s, l) => s + toCents(l.amount), 0);
