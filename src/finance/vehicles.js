// Per-vehicle earnings: income and expenses attributed to each vehicle, by period.
import { categoryType, effectiveLines, fyOf, toCents } from './categories';

// Lines attributed to a vehicle: the split's vehicle, else the transaction's, else the linked rental's.
export function vehicleLines(transactions, rentals) {
  const rentalVehicle = Object.fromEntries(rentals.map(r => [r.id, r.vehicleId]));
  const out = [];
  for (const t of transactions) {
    if (t.matchStatus === 'ignored') continue;
    for (const l of effectiveLines(t)) {
      const vehicleId = l.vehicleId || t.vehicleId || rentalVehicle[l.rentalId || t.rentalId] || null;
      const type = categoryType(l.category);
      if (!vehicleId || (type !== 'income' && type !== 'operating' && l.category !== 'vehicle_purchase')) continue;
      out.push({ ...l, vehicleId, type, description: t.description, transactionId: t.id });
    }
  }
  return out;
}

export function vehicleSummary(transactions, rentals, vehicles, today) {
  const fy = fyOf(today);
  const by = {};
  for (const l of vehicleLines(transactions, rentals)) {
    const v = (by[l.vehicleId] ||= { income: 0, expenses: 0, incomeFy: 0, expensesFy: 0, purchases: 0, byCategory: {}, count: 0, last: null });
    const c = toCents(l.amount);
    if (l.type === 'income') { v.income += c; if (fyOf(l.date) === fy) v.incomeFy += c; }
    else if (l.type === 'operating') { v.expenses += -c; if (fyOf(l.date) === fy) v.expensesFy += -c; v.byCategory[l.category] = (v.byCategory[l.category] || 0) - c; }
    else if (l.category === 'vehicle_purchase') v.purchases += -c;
    v.count++;
    if (!v.last || l.date > v.last) v.last = l.date;
  }
  const unattributed = { income: 0, expenses: 0 };
  for (const t of transactions) {
    if (t.matchStatus === 'ignored') continue;
    for (const l of effectiveLines(t)) {
      const has = l.vehicleId || t.vehicleId || rentals.find(r => r.id === (l.rentalId || t.rentalId))?.vehicleId;
      if (has) continue;
      const type = categoryType(l.category);
      if (type === 'income') unattributed.income += toCents(l.amount);
      if (type === 'operating') unattributed.expenses += -toCents(l.amount);
    }
  }
  const rows = vehicles.map(v => {
    const s = by[v.id] || { income: 0, expenses: 0, incomeFy: 0, expensesFy: 0, purchases: 0, byCategory: {}, count: 0, last: null };
    const price = Number(v.purchasePrice) || (s.purchases / 100) || 0;
    const net = (s.income - s.expenses) / 100;
    const daysRented = rentals.filter(r => r.vehicleId === v.id).reduce((d, r) => { if (!r.startDate) return d; const end = r.endDate || today; return d + Math.max(0, (new Date(end) - new Date(r.startDate)) / 86400000); }, 0);
    return { vehicle: v, income: s.income / 100, expenses: s.expenses / 100, incomeFy: s.incomeFy / 100, expensesFy: s.expensesFy / 100, net, netFy: (s.incomeFy - s.expensesFy) / 100, purchasePrice: price, recovered: price ? Math.max(0, net) / price : null, byCategory: Object.fromEntries(Object.entries(s.byCategory).map(([k, c]) => [k, c / 100])), count: s.count, last: s.last, daysRented: Math.round(daysRented), rentals: rentals.filter(r => r.vehicleId === v.id).length };
  }).sort((a, b) => b.net - a.net);
  return { rows, unattributed: { income: unattributed.income / 100, expenses: unattributed.expenses / 100 } };
}
