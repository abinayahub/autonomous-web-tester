import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Columns2, Images, Maximize2, Monitor, Smartphone, Tablet, X } from 'lucide-react';
import { EmptyState } from '../components/feedback';
import { RevealImg } from '../components/motion';
import { Select, Tabs } from '../components/forms';
import { Lightbox } from '../components/Lightbox';
import { ButtonLink, Card, DemoTag, PageHeader, cx } from '../components/ui';
import { relativeTime } from '../lib/format';
import { useData } from '../lib/store';
import type { DeviceClass, Screenshot } from '../lib/types';

type Kind = 'all' | 'issue' | 'pairs' | 'pages';
const DEVICE_ICON: Record<DeviceClass, typeof Monitor> = { DESKTOP: Monitor, TABLET: Tablet, MOBILE: Smartphone };

export function Screenshots() {
  const data = useData();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<Kind>('all');
  const [device, setDevice] = useState<DeviceClass | ''>('');
  const issueFilter = params.get('issue') ?? '';
  const project = params.get('project') ?? '';
  const [viewer, setViewer] = useState<number>();

  const items = useMemo(() => {
    return data.screenshots.filter((s) => {
      if (issueFilter && s.issueId !== issueFilter) return false;
      if (project && s.projectId !== project) return false;
      if (device && s.device !== device) return false;
      if (kind === 'issue') return s.kind === 'ISSUE';
      if (kind === 'pairs') return s.kind === 'BEFORE' || s.kind === 'AFTER';
      if (kind === 'pages') return s.kind === 'PAGE';
      return true;
    });
  }, [data.screenshots, issueFilter, project, device, kind]);

  const issue = issueFilter ? data.issues.find((i) => i.id === issueFilter) : undefined;
  const all = data.screenshots;
  const count = (k: Kind) => all.filter((s) => (k === 'all' ? true : k === 'issue' ? s.kind === 'ISSUE' : k === 'pairs' ? s.kind === 'BEFORE' || s.kind === 'AFTER' : s.kind === 'PAGE')).length;

  // Group before/after pairs into one card when viewing pairs.
  const cards: Array<{ key: string; shots: Screenshot[] }> = [];
  const seen = new Set<string>();
  for (const s of items) {
    if (s.pairId && kind === 'pairs') {
      if (seen.has(s.pairId)) continue;
      seen.add(s.pairId);
      const pair = items.filter((x) => x.pairId === s.pairId).sort((a, b) => Number(a.kind !== 'BEFORE') - Number(b.kind !== 'BEFORE'));
      cards.push({ key: s.pairId, shots: pair });
    } else cards.push({ key: s.id, shots: [s] });
  }

  const open = (s: Screenshot) => setViewer(items.findIndex((x) => x.id === s.id));
  const issueKey = (s: Screenshot) => data.issues.find((i) => i.id === s.issueId);

  return (
    <>
      <PageHeader title="Screenshot evidence" description="Every screenshot captured during testing — issue highlights, before/after comparisons and full-page captures. Password fields are always masked." />

      {all.length === 0 ? (
        <Card>
          <EmptyState icon={Images} title="No screenshots yet" action={<ButtonLink to="/configure">Configure a test</ButtonLink>}>
            Screenshots are captured automatically as evidence during test runs. Switch on <strong>Demo data</strong> to preview the gallery and full-screen viewer.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <Tabs
              value={kind}
              onChange={setKind}
              items={[
                { value: 'all', label: 'All', count: count('all') },
                { value: 'issue', label: 'Issue evidence', count: count('issue') },
                { value: 'pairs', label: 'Before & after', count: count('pairs') / 2, icon: Columns2 },
                { value: 'pages', label: 'Full pages', count: count('pages') },
              ]}
            />
            <Select aria-label="Device" value={device} onChange={(e) => setDevice(e.target.value as DeviceClass | '')} className="w-40">
              <option value="">All devices</option>
              <option value="DESKTOP">Desktop</option>
              <option value="TABLET">Tablet</option>
              <option value="MOBILE">Mobile</option>
            </Select>
            <Select aria-label="Project" value={project} onChange={(e) => { const n = new URLSearchParams(params); if (e.target.value) n.set('project', e.target.value); else n.delete('project'); setParams(n, { replace: true }); }} className="w-52">
              <option value="">All projects</option>
              {data.projects.filter((p) => all.some((s) => s.projectId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
            {issue && (
              <span className="inline-flex items-center gap-2 rounded-lg bg-brand-50 py-1.5 pl-3 pr-1.5 text-sm text-brand-800">
                Issue {issue.key}
                <button onClick={() => { const n = new URLSearchParams(params); n.delete('issue'); setParams(n, { replace: true }); }} className="rounded p-0.5 hover:bg-brand-100" aria-label="Clear issue filter"><X className="size-3.5" /></button>
              </span>
            )}
            <span className="ml-auto text-xs text-slate-500">{items.length} screenshot{items.length === 1 ? '' : 's'}</span>
          </div>

          {cards.length === 0 ? (
            <Card><EmptyState compact icon={Images} title="No screenshots match these filters" /></Card>
          ) : (
            <div key={kind} className={cx('stagger grid gap-5', kind === 'pairs' ? 'lg:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4')}>
              {cards.map(({ key, shots }) => {
                const s = shots[0]!;
                const DevIcon = DEVICE_ICON[s.device];
                const iss = issueKey(s);
                return (
                  <Card key={key} interactive className="overflow-hidden">
                    <div className={cx('grid gap-px bg-slate-200', shots.length > 1 && 'grid-cols-2')}>
                      {shots.map((x) => (
                        <button key={x.id} onClick={() => open(x)} className="group relative block aspect-[16/10] overflow-hidden bg-slate-50" aria-label={`View ${x.label} full screen`}>
                          <RevealImg src={x.src} alt={x.label} loading="lazy" className={cx('size-full group-hover:scale-105', x.device === 'MOBILE' ? 'object-contain' : 'object-cover object-top')} />
                          {shots.length > 1 && <span className="absolute left-2 top-2 rounded-md bg-slate-900/75 px-2 py-0.5 text-[11px] font-semibold text-white">{x.kind === 'BEFORE' ? 'Before' : 'After'}</span>}
                          <span className="absolute inset-0 grid place-items-center bg-slate-900/0 opacity-0 transition duration-300 group-hover:bg-slate-900/25 group-hover:opacity-100"><Maximize2 className="size-6 scale-75 text-white drop-shadow transition-transform duration-300 ease-out group-hover:scale-100" /></span>
                        </button>
                      ))}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-2">
                        {s.demo && <DemoTag />}
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{shots.length > 1 ? `Before / after · ${s.pageName}` : s.kind === 'PAGE' ? s.label : iss?.title ?? s.label}</p>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1"><DevIcon className="size-3.5" />{s.width}×{s.height}</span>
                        <span>{s.pageName}</span>
                        <span>{relativeTime(s.capturedAt)}</span>
                        {iss && <Link to={`/issues/${iss.id}`} className="font-mono font-medium text-brand-600 hover:underline">{iss.key}</Link>}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
      {viewer !== undefined && viewer >= 0 && <Lightbox items={items} index={viewer} onIndex={setViewer} onClose={() => setViewer(undefined)} all={all} />}
    </>
  );
}
