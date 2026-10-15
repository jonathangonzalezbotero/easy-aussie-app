// Forecast generation: income from active rentals and the fleet target; expenses from
// recurring items, rego expiries, maintenance averages and the Stripe fee share.
import { addMonths, effectiveLines, monthKey, categoryType } from './categories';

const DAY = 86400000;
const daysInMonth = (key) => { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const monthBounds = (key) => ({ start: `${key}-01`, end: `${key}-${String(daysInMonth(key)).padStart(2, '0')}` });
const overlapDays = (aStart, aEnd, bStart, bEnd) => { const s = aStart > bStart ? aStart : bStart; const e = aEnd < bEnd ? aEnd : bEnd; if (e < s) return 0; return Math.round((new Date(e + 'T00:00:00Z') - new Date(s + 'T00:00:00Z')) / DAY) + 1; };

export const WEEKS_PER_MONTH = 52 / 12;

// Income a rental brings in a month: weekly price pro-rated by days, or a fixed amount on its start month.
export function rentalIncomeForMonth(rental, key, todayStr) {
  if (!rental.price) return 0;
  const { start, end } = monthBounds(key);
  const from = rental.startDate || start;
  if (rental.billingPeriod === 'fixed') return monthKey(from) === key ? Number(rental.price) : 0;
  // Open-ended active rentals are assumed to continue; completed ones stop at their end date.
  const to = rental.status === 'completed' ? (rental.endDate || from) : (rental.endDate || '9999-12-31');
  if (rental.status === 'active' && todayStr && to < todayStr) return 0;
  const days = overlapDays(from, to, start, end);
  return days * Number(rental.price) / 7;
}

export function fleetTargetMonthly(vehicles, settings) {
  const rentable = vehicles.filter(v => ['available', 'rented', 'maintenance'].includes(v.status));
  const scooters = rentable.filter(v => v.type !== 'ebike').length;
  const ebikes = rentable.filter(v => v.type === 'ebike').length;
  const weekly = settings.targetOccupancy * (scooters * settings.scooterWeeklyRate + ebikes * settings.ebikeWeeklyRate);
  return { weekly, monthly: weekly * WEEKS_PER_MONTH, scooters, ebikes };
}

function occurrencesInMonth(rec, key) {
  if (!rec.nextDue || rec.active === false) return 0;
  const { start, end } = monthBounds(key);
  if (rec.frequency === 'monthly') return rec.nextDue <= end ? 1 : 0;
  if (rec.frequency === 'yearly') { const d = rec.nextDue.slice(5); const y = key.slice(0, 4); const inThisYear = `${y}-${d}`; return inThisYear >= start && inThisYear <= end && inThisYear >= rec.nextDue.slice(0, 7) + '-01' ? 1 : 0; }
  const step = rec.frequency === 'weekly' ? 7 : 14;
  let n = 0; let d = new Date(rec.nextDue + 'T00:00:00Z');
  const s = new Date(start + 'T00:00:00Z'), e = new Date(end + 'T00:00:00Z');
  while (d < s) d = new Date(d.getTime() + step * DAY);
  while (d <= e) { n++; d = new Date(d.getTime() + step * DAY); }
  return n;
}

// Average of the last 3 complete months of actuals for a category (as a positive expense).
function threeMonthAverage(transactions, category, fromKey) {
  const months = [addMonths(fromKey, -3), addMonths(fromKey, -2), addMonths(fromKey, -1)];
  let total = 0;
  for (const t of transactions) { const k = monthKey(t.date); if (!months.includes(k)) continue; for (const l of effectiveLines(t)) if (l.category === category) total += -(Number(l.amount) || 0); }
  return Math.max(0, total / 3);
}

// Returns { months, income: {active, target}, rows: [{category, type, cells: {month: {value, origin, override}}}], totals }
export function generateForecast({ months, rentals, vehicles, recurring, regoRenewals, transactions, overrides, settings, todayStr }) {
  const current = monthKey(todayStr);
  const cells = {};   // category -> month -> { value, origin }
  const put = (cat, m, value, origin) => { const c = (cells[cat] ||= {}); const prev = c[m]; c[m] = { value: (prev?.value || 0) + value, origin: prev ? `${prev.origin}; ${origin}` : origin }; };

  const active = rentals.filter(r => r.status === 'active');
  const target = fleetTargetMonthly(vehicles, settings);
  const income = { active: {}, target: {} };
  for (const m of months) {
    income.active[m] = active.reduce((s, r) => s + rentalIncomeForMonth(r, m, todayStr), 0);
    income.target[m] = target.monthly;
  }

  for (const m of months) {
    for (const rec of recurring) {
      const n = occurrencesInMonth(rec, m);
      if (n) put(rec.category, m, n * Number(rec.amount), `${rec.name}: ${rec.amount} ${rec.frequency}${n > 1 ? ` × ${n}` : ''}`);
    }
    // Rego from vehicle expiry dates
    for (const v of vehicles) {
      if (!v.regoExpiry || ['stolen', 'sold'].includes(v.status)) continue;
      const dueMonth = monthKey(v.regoExpiry);
      // repeats yearly: match month/day in each forecast year after expiry
      const [, mm] = v.regoExpiry.split('-');
      if (m.slice(5) === mm && m >= dueMonth) {
        const last = [...regoRenewals].filter(r => r.vehicleId === v.id && r.cost).sort((a, b) => b.renewalDate.localeCompare(a.renewalDate))[0];
        const cost = last?.cost;
        if (cost) put('rego', m, cost, `Rego for ${v.plate} expires ${v.regoExpiry}. Amount from the last renewal (${last.renewalDate}).`);
        else put('rego', m, 0, `Rego for ${v.plate} expires ${v.regoExpiry} but no renewal cost is recorded in Vehicles.`);
      }
    }
    // Averages for the variable categories, unless a recurring item already covers them
    for (const cat of ['maintenance', 'fuel', 'other_expense', 'marketing']) {
      if (cells[cat]?.[m]) continue;
      const avg = threeMonthAverage(transactions, cat, current);
      if (avg > 0) put(cat, m, Math.round(avg), `3-month average of ${cat === 'maintenance' ? 'repairs and parts' : cat}`);
    }
    // Stripe fees ≈ 1.75% + 30c per weekly charge
    const charges = active.filter(r => r.billingPeriod !== 'fixed').length * WEEKS_PER_MONTH;
    const fee = income.active[m] * 0.0175 + charges * 0.30;
    if (fee > 0 && !cells.software_fees?.[m]) put('software_fees', m, Math.round(fee), 'Stripe fees ≈ 1.75% + 30c per charge on rental income');
    else if (fee > 0) put('software_fees', m, Math.round(fee), 'plus Stripe fees ≈ 1.75% + 30c per charge');
  }

  // Overrides win
  const ovMap = {};
  for (const o of overrides) ovMap[`${monthKey(o.month)}|${o.category}`] = o;
  const categories = [...new Set([...Object.keys(cells), ...overrides.map(o => o.category)])];
  const rows = categories.map(cat => ({
    category: cat, type: categoryType(cat),
    cells: Object.fromEntries(months.map(m => {
      const ov = ovMap[`${m}|${cat}`];
      const gen = cells[cat]?.[m];
      return [m, { value: ov ? ov.amount : (gen?.value || 0), generated: gen?.value || 0, origin: gen?.origin || 'No generated value', override: !!ov, note: ov?.note }];
    })),
  })).sort((a, b) => (a.type === b.type ? 0 : a.type === 'operating' ? -1 : 1));

  const totals = Object.fromEntries(months.map(m => {
    const operating = rows.filter(r => r.type === 'operating').reduce((s, r) => s + r.cells[m].value, 0);
    const capital = rows.filter(r => r.type === 'capital').reduce((s, r) => s + r.cells[m].value, 0);
    return [m, { operating, capital }];
  }));
  return { months, income, rows, totals, target };
}
