import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight, Columns2, Download, ExternalLink, Maximize2, Minimize2, X } from 'lucide-react';
import { formatDate, humanize } from '../lib/format';
import type { Screenshot } from '../lib/types';
import { DemoTag, cx } from './ui';

export function Lightbox({ items, index, onIndex, onClose, all }: { items: Screenshot[]; index: number; onIndex: (i: number) => void; onClose: () => void; all?: Screenshot[] }) {
  const shot = items[index];
  const [zoom, setZoom] = useState(false);
  const [compare, setCompare] = useState(false);
  const pool = all ?? items;
  const partner = shot?.pairId ? pool.find((s) => s.pairId === shot.pairId && s.id !== shot.id) : undefined;
  const pair = shot && partner ? (shot.kind === 'BEFORE' ? [shot, partner] : [partner, shot]) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onIndex((index + 1) % items.length);
      else if (e.key === 'ArrowLeft') onIndex((index - 1 + items.length) % items.length);
      else if (e.key.toLowerCase() === 'z') setZoom((z) => !z);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [index, items.length, onIndex, onClose]);

  const partnerId = partner?.id;
  useEffect(() => {
    setZoom(false);
    if (!partnerId) setCompare(false);
  }, [index, partnerId]);

  if (!shot) return null;
  const tool = 'grid size-9 place-items-center rounded-lg text-slate-300 transition-[color,background-color,transform] duration-200 hover:bg-white/10 hover:text-white active:scale-90';

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/95 text-white anim-fade" role="dialog" aria-modal="true" aria-label="Screenshot viewer">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {shot.demo && <DemoTag />}
            <p className="truncate text-sm font-semibold">{compare && pair ? 'Before / after comparison' : shot.label}</p>
          </div>
          <p className="truncate text-xs text-slate-400">
            {shot.pageName} · {shot.pageUrl} · {humanize(shot.device)} {shot.width}×{shot.height} · {formatDate(shot.capturedAt)}
          </p>
        </div>
        <span className="hidden text-xs tabular-nums text-slate-400 sm:block">{index + 1} / {items.length}</span>
        {pair && (
          <button onClick={() => setCompare((c) => !c)} className={cx(tool, compare && 'bg-white/15 text-white')} aria-label="Compare before and after" title="Compare before / after">
            <Columns2 className="size-[18px]" />
          </button>
        )}
        <button onClick={() => setZoom((z) => !z)} className={tool} aria-label={zoom ? 'Fit to screen' : 'Actual size'} title={zoom ? 'Fit to screen (Z)' : 'Actual size (Z)'}>
          {zoom ? <Minimize2 className="size-[18px]" /> : <Maximize2 className="size-[18px]" />}
        </button>
        <a href={shot.src} download={`${shot.id}.${shot.src.startsWith('/api/') ? 'png' : 'svg'}`} className={tool} aria-label="Download" title="Download">
          <Download className="size-[18px]" />
        </a>
        {shot.issueId && (
          <Link to={`/issues/${shot.issueId}`} onClick={onClose} className={tool} aria-label="Open related issue" title="Open related issue">
            <ExternalLink className="size-[18px]" />
          </Link>
        )}
        <button onClick={onClose} className={tool} aria-label="Close viewer (Esc)" title="Close (Esc)">
          <X className="size-5" />
        </button>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className={cx('absolute inset-0 p-4 sm:p-8', zoom ? 'overflow-auto' : 'flex items-center justify-center')}>
          {compare && pair ? (
            <div className="stagger grid grid-cols-1 h-full w-full gap-4 md:grid-cols-2">
              {pair.map((s) => (
                <figure key={s.id} className="flex min-h-0 flex-col">
                  <figcaption className="mb-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-400">{s.kind === 'BEFORE' ? 'Before action' : 'After action'}</figcaption>
                  <img src={s.src} alt={s.label} className="min-h-0 w-full flex-1 object-contain" />
                </figure>
              ))}
            </div>
          ) : (
            <img key={shot.id} src={shot.src} alt={shot.label} className={cx('anim-rise rounded-lg bg-white shadow-2xl', zoom ? 'mx-auto max-w-none' : 'max-h-full max-w-full object-contain')} />
          )}
        </div>
        {items.length > 1 && (
          <>
            <button onClick={() => onIndex((index - 1 + items.length) % items.length)} className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:scale-105 hover:bg-black/70 active:scale-95" aria-label="Previous screenshot">
              <ChevronLeft className="size-6" />
            </button>
            <button onClick={() => onIndex((index + 1) % items.length)} className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition hover:scale-105 hover:bg-black/70 active:scale-95" aria-label="Next screenshot">
              <ChevronRight className="size-6" />
            </button>
          </>
        )}
      </div>

      {items.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-3">
          {items.map((s, i) => (
            <button key={s.id} onClick={() => onIndex(i)} className={cx('h-14 w-20 shrink-0 overflow-hidden rounded-md ring-2 transition', i === index ? 'ring-brand-400' : 'opacity-60 ring-transparent hover:opacity-100')} aria-label={`Show ${s.label}`}>
              <img src={s.src} alt="" className="size-full bg-white object-cover object-top" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
