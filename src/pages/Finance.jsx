import { useSearchParams } from 'react-router-dom';
import { useFinance } from '../finance/FinanceContext';
import Tabs from '../components/shared/Tabs';
import EmptyState from '../components/shared/EmptyState';
import Overview from './finance/Overview';
import Transactions from './finance/Transactions';
import Reconcile from './finance/Reconcile';
import Forecast from './finance/Forecast';
import FYSummary from './finance/FYSummary';
import Payees from './finance/Payees';
import VehiclesFinance from './finance/VehiclesFinance';
import FinanceSettings from './finance/FinanceSettings';
import { Skeleton } from './finance/bits';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'reconcile', label: 'Reconcile' },
  { value: 'payees', label: 'Payees' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'forecast', label: 'Forecast' },
  { value: 'fy', label: 'FY summary' },
  { value: 'settings', label: 'Settings' },
];

export default function Finance() {
  const fin = useFinance();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'overview';
  const setTab = (t, extra = {}) => setParams({ tab: t, ...extra });

  if (fin.error) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Finance</h1></div>
        <div className="card">
          <EmptyState icon="▦" message={<span>Finance tables are not set up yet. Run <code>supabase/migration_finance.sql</code> in the Supabase SQL Editor, then reload.<br /><span className="text-sm">{fin.error}</span></span>}
            action={<button className="btn btn-secondary" onClick={fin.refresh}>Retry</button>} />
        </div>
      </div>
    );
  }

  const tabs = TABS.map(t => t.value === 'reconcile' && fin.queueCount ? { ...t, count: fin.queueCount } : t);
  const go = (t, extra) => setTab(t, extra);

  return (
    <div className="finance">
      <div className="mb-16"><Tabs tabs={tabs} active={tab} onChange={setTab} /></div>
      {fin.loading ? <div className="card"><Skeleton rows={6} label="Loading finance data" /></div> : (
        <>
          {tab === 'overview' && <Overview go={go} />}
          {tab === 'transactions' && <Transactions go={go} />}
          {tab === 'reconcile' && <Reconcile go={go} />}
          {tab === 'payees' && <Payees go={go} />}
          {tab === 'vehicles' && <VehiclesFinance go={go} />}
          {tab === 'forecast' && <Forecast go={go} />}
          {tab === 'fy' && <FYSummary go={go} />}
          {tab === 'settings' && <FinanceSettings go={go} />}
        </>
      )}
    </div>
  );
}
