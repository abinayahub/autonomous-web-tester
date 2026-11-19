import { Circle } from 'lucide-react';
import { useLiveRun } from '../lib/live';
import { useData, useStore } from '../lib/store';
import { SeverityPanel, TrendChart } from './dashboard/Analytics';
import { ControlCenter, Overview, computeTotals } from './dashboard/ControlCenter';
import { LivePanel } from './dashboard/LivePanel';
import { Timeline } from './dashboard/Timeline';

/**
 * Testing control center. Every number comes from useData() (your projects + demo data only when Demo mode is on)
 * and the live run; nothing is estimated. Sections reveal on scroll via <PageReveal> in AppLayout.
 */
export function Dashboard() {
  const data = useData();
  const store = useStore();
  const { run: live } = useLiveRun();
  const t = computeTotals(data);
  const firstName = (store.profile.name || store.session?.name || '').split(' ')[0] ?? '';

  return (
    <>
      <ControlCenter name={firstName} t={t} live={live} demo={data.demo} />

      <Overview data={data} t={t} demo={data.demo} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <LivePanel data={data} live={live} />
        <Timeline items={data.activity} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
        <TrendChart data={data} />
        <SeverityPanel data={data} />
      </div>

      {!data.demo && data.runs.length === 0 && (
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-slate-400">
          <Circle className="size-2 fill-current" /> Test results appear once the test engine is connected. Nothing on this page is simulated — switch on <strong className="font-semibold text-slate-500">Demo data</strong> to preview it with sample results.
        </p>
      )}
    </>
  );
}
