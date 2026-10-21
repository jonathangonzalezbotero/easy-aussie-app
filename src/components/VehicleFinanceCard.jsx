import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '../finance/FinanceContext';
import { useStore } from '../context/StoreContext';
import { vehicleLines } from '../finance/vehicles';
import { categoryLabel, fyOf, money, money0, toCents } from '../finance/categories';
import { formatDate, todayStr } from '../utils/dates';

const NONE = [];

// Finance summary for one vehicle, shown in the Vehicles detail drawer.
export default function VehicleFinanceCard({ vehicle }) {
  const fin = useFinance();
  const { data } = useStore();
  const navigate = useNavigate();
  const [today] = useState(() => todayStr());
  const transactions = fin?.transactions || NONE;
  const lines = useMemo(() => vehicleLines(transactions, data.rentals).filter(l => l.vehicleId === vehicle.id).sort((a, b) => b.date.localeCompare(a.date)), [transactions, data.rentals, vehicle.id]);
  if (!fin || fin.error) return null;
  const fy = fyOf(today);
  const sum = (pred) => lines.filter(pred).reduce((s, l) => s + toCents(l.amount), 0) / 100;
  const income = sum(l => l.type === 'income'), expenses = -sum(l => l.type === 'operating');
  const incomeFy = sum(l => l.type === 'income' && fyOf(l.date) === fy), expensesFy = -sum(l => l.type === 'operating' && fyOf(l.date) === fy);
  const net = income - expenses;
  const price = Number(vehicle.purchasePrice) || 0;
  const rec = price ? Math.max(0, net) / price : null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div className="drawer-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Finance <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/finance?tab=transactions&vehicle=${vehicle.id}`)}>All transactions ›</button></div>
      {lines.length === 0 ? <div className="text-sm text-muted">No income or expenses attributed to this vehicle yet.</div> : (
        <>
          <div className="grid-2" style={{ gap: 10, marginBottom: 10 }}>
            <div style={{ background: 'var(--accent-light)', borderRadius: 10, padding: '10px 12px' }}><div className="label">Income</div><div style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{money0(income)}</div><div className="text-sm text-muted">{money0(incomeFy)} this FY</div></div>
            <div style={{ background: 'var(--red-bg)', borderRadius: 10, padding: '10px 12px' }}><div className="label">Expenses</div><div style={{ fontSize: 20, fontWeight: 700, color: 'var(--red)' }}>{money0(expenses)}</div><div className="text-sm text-muted">{money0(expensesFy)} this FY</div></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}><span>Net</span><span className="fw-600" style={{ color: net < 0 ? 'var(--red)' : 'inherit' }}>{money(net)}</span></div>
          {rec != null && <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10 }}><span className="text-muted">Purchase {money0(price)} recovered</span><div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3 }}><div style={{ width: `${Math.min(100, rec * 100)}%`, height: 6, background: rec >= 1 ? 'var(--accent)' : 'var(--amber)', borderRadius: 3 }} /></div><span className="fw-600">{Math.round(rec * 100)}%</span></div>}
          {lines.slice(0, 5).map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '5px 0', borderTop: '1px solid var(--border)' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span className="text-muted">{formatDate(l.date).replace(/ \d{4}$/, '')}</span> · {categoryLabel(l.category)} <span className="text-muted">· {(l.label || l.description).slice(0, 28)}</span></span>
              <span className="fw-600" style={{ color: Number(l.amount) < 0 ? 'var(--red)' : 'var(--accent)', whiteSpace: 'nowrap' }}>{money(l.amount, { sign: true })}</span>
            </div>))}
        </>
      )}
    </div>
  );
}
