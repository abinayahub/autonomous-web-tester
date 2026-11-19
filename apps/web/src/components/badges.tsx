import { AlertOctagon, AlertTriangle, ArrowDown, CheckCircle2, CircleDot, Clock, Info, Loader2, Minus, Octagon, ShieldQuestion, Shuffle, StopCircle, XCircle } from 'lucide-react';
import { ENVIRONMENT_INFO, moduleInfo } from '../lib/catalog';
import type { Classification, Environment, IssueStatus, ModuleId, ProjectStatus, RunStatus, Severity } from '../lib/types';
import { Badge, type Tone } from './ui';

// Status colours are always paired with an icon AND a text label (never colour alone).

const SEV: Record<Severity, { tone: Tone; label: string; icon: typeof Info }> = {
  CRITICAL: { tone: 'red', label: 'Critical', icon: AlertOctagon },
  HIGH: { tone: 'orange', label: 'High', icon: AlertTriangle },
  MEDIUM: { tone: 'amber', label: 'Medium', icon: Minus },
  LOW: { tone: 'blue', label: 'Low', icon: ArrowDown },
  INFO: { tone: 'gray', label: 'Info', icon: Info },
};
export const severityLabel = (s: Severity) => SEV[s].label;
export const SeverityBadge = ({ s }: { s: Severity }) => <Badge tone={SEV[s].tone} icon={SEV[s].icon} className={s === 'CRITICAL' ? 'sev-critical' : undefined}>{SEV[s].label}</Badge>;

const IST: Record<IssueStatus, { tone: Tone; label: string }> = {
  OPEN: { tone: 'blue', label: 'Open' },
  ACKNOWLEDGED: { tone: 'violet', label: 'Acknowledged' },
  FIXED: { tone: 'green', label: 'Fixed' },
  FALSE_POSITIVE: { tone: 'gray', label: 'False positive' },
  WONT_FIX: { tone: 'gray', label: "Won't fix" },
};
export const issueStatusLabel = (s: IssueStatus) => IST[s].label;
export const IssueStatusBadge = ({ s }: { s: IssueStatus }) => <Badge tone={IST[s].tone} icon={CircleDot}>{IST[s].label}</Badge>;

const CLS: Record<Classification, { tone: Tone; label: string; icon: typeof Info }> = {
  CONFIRMED: { tone: 'brand', label: 'Confirmed', icon: CheckCircle2 },
  FLAKY: { tone: 'amber', label: 'Flaky', icon: Shuffle },
  NEEDS_REVIEW: { tone: 'violet', label: 'Needs review', icon: ShieldQuestion },
};
export const ClassificationBadge = ({ c }: { c: Classification }) => <Badge tone={CLS[c].tone} icon={CLS[c].icon}>{CLS[c].label}</Badge>;

const PST: Record<ProjectStatus, { tone: Tone; label: string; icon: typeof Info }> = {
  NOT_TESTED: { tone: 'gray', label: 'Not tested yet', icon: Clock },
  TESTING: { tone: 'brand', label: 'Testing', icon: Loader2 },
  PASSED: { tone: 'green', label: 'Passing', icon: CheckCircle2 },
  ISSUES_FOUND: { tone: 'orange', label: 'Issues found', icon: AlertTriangle },
  FAILED: { tone: 'red', label: 'Run failed', icon: XCircle },
};
export const ProjectStatusBadge = ({ s }: { s: ProjectStatus }) => (
  <Badge tone={PST[s].tone} icon={PST[s].icon} className={s === 'TESTING' ? '[&>svg]:animate-spin' : undefined}>{PST[s].label}</Badge>
);

const RST: Record<RunStatus, { tone: Tone; label: string; icon: typeof Info }> = {
  QUEUED: { tone: 'gray', label: 'Queued', icon: Clock },
  RUNNING: { tone: 'brand', label: 'Running', icon: Loader2 },
  COMPLETED: { tone: 'green', label: 'Completed', icon: CheckCircle2 },
  STOPPED: { tone: 'gray', label: 'Stopped', icon: StopCircle },
  FAILED: { tone: 'red', label: 'Failed', icon: Octagon },
};
export const RunStatusBadge = ({ s }: { s: RunStatus }) => <Badge tone={RST[s].tone} icon={RST[s].icon} className={s === 'RUNNING' ? '[&>svg]:animate-spin' : undefined}>{RST[s].label}</Badge>;

export const EnvBadge = ({ e }: { e: Environment }) => (
  <Badge tone={e === 'PRODUCTION' ? 'red' : e === 'STAGING' ? 'violet' : e === 'TEST' ? 'blue' : 'gray'}>{ENVIRONMENT_INFO[e].label}</Badge>
);

export function ModuleBadge({ m }: { m: ModuleId }) {
  const info = moduleInfo(m);
  return <Badge icon={info.icon}>{info.name}</Badge>;
}
