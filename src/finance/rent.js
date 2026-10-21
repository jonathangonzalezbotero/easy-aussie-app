// Rent arrears for active rentals. A weekly rental is expected to produce a rental_income line
// (Stripe charge, bank transfer or cash) at least every 7 days. Grace covers the Stripe sync
// running once a day and a charge retrying overnight.
import { effectiveLines } from './categories';

export const GRACE_DAYS = 2;
const DAY = 86400000;
const days = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / DAY);

// Payments per rental: rental_income lines on the rental, or on the customer with no rental when only one is active.
function paymentsByRental(transactions, rentals) {
  const byRental = {};
  const activeByCustomer = {};
  for (const r of rentals) if (r.status === 'active') (activeByCustomer[r.customerId] ||= []).push(r);
  for (const t of transactions) {
    if (t.matchStatus === 'ignored') continue;
    for (const l of effectiveLines(t)) {
      if (l.category !== 'rental_income' || Number(l.amount) <= 0) continue;
      let rid = l.rentalId || t.rentalId;
      if (!rid) { const cid = l.customerId || t.customerId; const list = cid ? activeByCustomer[cid] : null; if (list?.length === 1) rid = list[0].id; }
      if (rid) (byRental[rid] ||= []).push({ date: t.date, amount: Number(l.amount) });
    }
  }
  return byRental;
}

// Returns rentals whose rent looks late: [{ rental, lastPaid, expected, daysLate, amount, reason }].
export function overdueRentals({ rentals, transactions, subscriptions = [], today }) {
  const paid = paymentsByRental(transactions, rentals);
  const out = [];
  for (const r of rentals) {
    if (r.status !== 'active' || !r.startDate) continue;
    const payments = (paid[r.id] || []).sort((a, b) => b.date.localeCompare(a.date));
    const last = payments[0]?.date || null;
    const sub = r.stripeSubscriptionId ? subscriptions.find(s => s.id === r.stripeSubscriptionId) : null;
    const pastDue = sub && (sub.status === 'past_due' || sub.status === 'unpaid' || sub.pastDueSince);
    if (r.billingPeriod === 'fixed') {
      if (!last && days(r.startDate, today) > GRACE_DAYS) out.push({ rental: r, lastPaid: null, expected: r.startDate, daysLate: days(r.startDate, today), amount: Number(r.price) || 0, reason: 'No payment recorded for this fixed-price rental' });
      else if (pastDue) out.push({ rental: r, lastPaid: last, expected: today, daysLate: 0, amount: sub.lastFailedAmount || Number(r.price) || 0, reason: sub.lastFailureReason ? `Stripe: ${sub.lastFailureReason}` : 'Stripe reports the payment failed' });
      continue;
    }
    // Weekly: next payment is due 7 days after the last one (or on the start date if none yet)
    const expected = last ? addDays(last, 7) : r.startDate;
    const late = days(expected, today) - GRACE_DAYS;
    if (pastDue) { out.push({ rental: r, lastPaid: last, expected, daysLate: Math.max(0, days(expected, today)), amount: sub.lastFailedAmount || Number(r.price) || 0, reason: sub.lastFailureReason ? `Stripe: ${sub.lastFailureReason}` : 'Stripe reports the payment failed' }); continue; }
    if (late > 0) out.push({ rental: r, lastPaid: last, expected, daysLate: days(expected, today), amount: Number(r.price) || 0, reason: last ? `Last payment ${days(last, today)} days ago, weekly rent expected by ${expected}` : 'No payment recorded since the rental started' });
  }
  return out.sort((a, b) => b.daysLate - a.daysLate);
}

function addDays(d, n) { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }
