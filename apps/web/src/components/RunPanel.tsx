import { Link } from 'react-router';
import { AlertTriangle, CheckCircle2, CircleDashed, Download, FileText, Loader2, Square, XCircle } from 'lucide-react';
import { useState } from 'react';
import { STAGE_LABEL, STAGE_ORDER, STAGE_ORDER_AUTH, cancelServerRun, isActive, useServerRun, type AuthSummary, type ServerRun } from '../lib/remote';
import { formatDate } from '../lib/format';
import { CountUp } from './motion';
import { Badge, Button, Card, CardHeader, ProgressBar, cx } from './ui';
import { useToast } from './feedback';

const STATUS: Record<ServerRun['status'], { tone: 'brand' | 'green' | 'red' | 'gray' | 'amber'; label: string }> = {
  QUEUED: { tone: 'gray', label: 'Queued' },
  RUNNING: { tone: 'brand', label: 'Running' },
  AWAITING_APPROVAL: { tone: 'amber', label: 'Awaiting approval' },
  COMPLETED: { tone: 'green', label: 'Completed' },
  FAILED: { tone: 'red', label: 'Failed' },
  CANCELLED: { tone: 'gray', label: 'Stopped' },
};

export function ServerRunBadge({ s }: { s: ServerRun['status'] }) {
  const m = STATUS[s];
  return <Badge tone={m.tone} icon={s === 'RUNNING' || s === 'QUEUED' ? Loader2 : s === 'COMPLETED' ? CheckCircle2 : s === 'FAILED' ? XCircle : Square} className={s === 'RUNNING' || s === 'QUEUED' ? '[&>svg]:animate-spin' : undefined}>{m.label}</Badge>;
}

export const reportUrl = (r: ServerRun) => (r.reports[0] ? `/api/reports/${r.reports[0].id}/file` : undefined);

/**
 * Live view of one real run: current stage, measured progress, counters as the engine records them,
 * recent events, and — when finished — the outcome and the PDF report.
 */
export function RunPanel({ runId, onChange }: { runId: string; onChange?: () => void }) {
  const { data: run, error } = useServerRun(runId);
  const toast = useToast();
  const [stopping, setStopping] = useState(false);
  if (error) return <Card><p className="p-5 text-sm text-rose-700">Could not load the test run: {error.message}</p></Card>;
  if (!run) return <Card><p className="flex items-center gap-2 p-5 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Loading test run…</p></Card>;

  const events = [...run.events].sort((a, b) => Number(a.id) - Number(b.id));
  const stages = events.filter((e) => e.type.startsWith('stage.') && !e.type.endsWith('.error'));
  const current = stages.at(-1)?.type.slice(6);
  const reached = new Set(stages.map((e) => e.type.slice(6)));
  const authEvents = run.auth ?? events;
  // Runs with test logins sign in before discovery.
  const order = reached.has('authenticated') || authEvents.some((e) => e.type.startsWith('auth.')) ? STAGE_ORDER_AUTH : STAGE_ORDER;
  const idx = current ? order.indexOf(current) : -1;
  const active = isActive(run);
  // Progress = completed engine stages (real stage events), not a timer.
  const pct = run.status === 'COMPLETED' ? 100 : Math.max(0, Math.round((Math.max(idx, 0) / order.length) * 100));
  const report = reportUrl(run);
  const errors = events.filter((e) => (e.level === 'ERROR' && !e.type.startsWith('auth.')) || e.type === 'browser.launch_failed');
  // Per test login: status, role check, dashboard, signed-in pages and errors (summary once discovery is done).
  const summaries = (run.auth ?? []).filter((e) => e.type === 'auth.summary' && e.data).map((e) => ({ id: e.id, s: e.data as AuthSummary }));
  // Before the summary exists (run in progress): the individual sign-in events.
  const auth = summaries.length ? [] : authEvents.filter((e) => e.type === 'auth.login' || e.type === 'auth.failed' || e.type === 'auth.session_lost');

  const stop = async () => {
    setStopping(true);
    try {
      await cancelServerRun(run.id);
      toast({ kind: 'info', title: 'Stopping the test', body: 'The current step finishes, then the browser closes.' });
      onChange?.();
    } catch (e) {
      toast({ kind: 'error', title: 'Could not stop the test', body: (e as Error).message });
    } finally {
      setStopping(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={active ? 'Testing in progress' : run.status === 'COMPLETED' ? 'Test run completed' : run.status === 'FAILED' ? 'Test run failed' : 'Test run stopped'}
        description={`Run ${run.id.slice(0, 8)} · started ${formatDate(run.startedAt ?? run.queuedAt)}${run.finishedAt ? ` · finished ${formatDate(run.finishedAt)}` : ''}`}
        action={<><ServerRunBadge s={run.status} />{active && <Button size="sm" variant="ghost" icon={Square} loading={stopping} onClick={stop}>Stop</Button>}</>}
      />
      <div className="space-y-5 p-5">
        {active && (
          <div>
            <div className="mb-2 flex items-end justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 font-medium text-slate-800">
                <Loader2 className="size-4 animate-spin text-brand-600" />
                {run.status === 'QUEUED' ? 'Waiting for a worker to pick up the job…' : current ? STAGE_LABEL[current] ?? current : 'Starting…'}
              </span>
              <span className="tabular-nums text-slate-500">{pct}%</span>
            </div>
            <ProgressBar value={pct} max={100} active />
            <p className="mt-2 truncate text-xs text-slate-500">{stages.at(-1)?.message ?? 'Queued'}</p>
          </div>
        )}
        {run.status === 'FAILED' && (
          <p className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-800"><XCircle className="mt-0.5 size-4 shrink-0" /><span><strong>The test could not be completed.</strong> {run.errorMessage}</span></p>
        )}
        {run.status === 'CANCELLED' && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">The run was stopped{run.errorMessage ? `: ${run.errorMessage}` : ''}. Results recorded before stopping are kept.</p>}

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Pages discovered', run.pagesDiscovered],
            ['Checks run', run.testsTotal],
            ['Passed', run.testsPassed],
            ['Failed', run.testsFailed],
            ['Issues', run.confirmedIssues],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-xl bg-slate-100/70 p-3">
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className={cx('font-display text-xl font-bold tabular-nums', k === 'Failed' && (v as number) > 0 ? 'text-rose-600' : 'text-slate-900')}><CountUp value={v as number} /></dd>
            </div>
          ))}
        </dl>

        <ol className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {order.map((s, i) => {
            const done = run.status === 'COMPLETED' || (reached.has(s) && i < idx);
            const now = active && s === current;
            return (
              <li key={s} className={cx('flex items-center gap-1.5 rounded-lg px-2 py-1.5', now ? 'bg-brand-50 font-semibold text-brand-700' : done ? 'text-slate-700' : 'text-slate-400')}>
                {done ? <CheckCircle2 className="size-3.5 text-emerald-600" /> : now ? <Loader2 className="size-3.5 animate-spin" /> : <CircleDashed className="size-3.5" />}
                {STAGE_LABEL[s]}
              </li>
            );
          })}
        </ol>

        {summaries.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {summaries.map(({ id, s }) => (
              <li key={id} className={cx('flex gap-2 rounded-lg px-3 py-2', s.status === 'SIGNED_IN' && !s.sessionLost ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900')}>
                {s.status === 'SIGNED_IN' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
                <span className="min-w-0">
                  <strong>{s.status === 'SIGNED_IN' ? 'Signed in' : 'Sign-in failed'} as “{s.role}”</strong>
                  {s.status === 'SIGNED_IN' ? (
                    <span className="block text-xs">
                      Role: {s.roleConfirmed ? 'confirmed' : 'not confirmed'}{s.roleCheck ? ` — ${s.roleCheck}` : ''}
                      <br />Dashboard: <span className="break-all">{s.dashboardUrl}</span>
                      <br />Signed-in pages discovered: {s.pages}
                      {s.sessionLost && <><br />{s.sessionLost}</>}
                    </span>
                  ) : (
                    <span className="block text-xs">{s.error}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {auth.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {auth.map((e) => (
              <li key={e.id} className={cx('flex gap-2 rounded-lg px-3 py-2', e.type === 'auth.login' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900')}>
                {e.type === 'auth.login' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
                <span><strong>{e.type === 'auth.login' ? 'Signed in' : e.type === 'auth.failed' ? 'Sign-in failed' : 'Session lost'}:</strong> {e.message}</span>
              </li>
            ))}
          </ul>
        )}
        {errors.length > 0 && (
          <ul className="space-y-1 text-xs text-amber-800">{errors.slice(-3).map((e) => <li key={e.id} className="flex gap-1.5"><AlertTriangle className="mt-px size-3.5 shrink-0" />{e.message}</li>)}</ul>
        )}

        {!active && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {report ? (
              <>
                <a href={report} target="_blank" rel="noreferrer" className="btn-motion inline-flex h-9.5 items-center gap-2 rounded-full bg-brand-600 px-3.5 text-sm font-semibold text-ivory transition-all hover:-translate-y-px hover:bg-brand-500"><FileText className="size-4" /> Open PDF report</a>
                <a href={report} download className="btn-motion inline-flex h-9.5 items-center gap-2 rounded-full bg-white/80 px-3.5 text-sm font-semibold text-slate-800 ring-1 ring-inset ring-slate-300/90 transition-all hover:-translate-y-px"><Download className="size-4" /> Download</a>
              </>
            ) : run.status === 'COMPLETED' ? <span className="text-sm text-slate-500">The report is being generated…</span> : null}
            {run.confirmedIssues + run.reviewItems > 0 && <Link to={`/live?run=${run.id}`} className="inline-flex h-9.5 items-center rounded-full px-3.5 text-sm font-semibold text-brand-600 hover:bg-brand-50">View run details</Link>}
          </div>
        )}
        {active && <p className="text-xs text-slate-500">You can leave this page — the test keeps running on the server. <Link to={`/live?run=${run.id}`} className="font-medium text-brand-600">Open live view</Link></p>}
      </div>
    </Card>
  );
}
