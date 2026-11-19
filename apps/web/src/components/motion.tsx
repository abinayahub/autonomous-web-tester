import { useEffect, useLayoutEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode, type RefObject } from 'react';
import type { Transition, Variants } from 'motion/react';
const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(' ');

/**
 * Shared motion layer for the application.
 *
 * One style everywhere: elements rise a few pixels while fading in, on the same soft ease-out curve.
 * - CSS classes (index.css → "Motion system") handle entrances, staggers, table rows and hovers.
 * - Motion (motion/react) variants below handle things that also need to animate OUT: menus, drawers, toasts, modals.
 * - Reduced motion: CSS swaps every entrance for an opacity-only fade; <MotionConfig reducedMotion="user">
 *   drops Motion's transforms. Count-ups, bar fills and fades still play, so nothing looks frozen.
 */

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const springSoft: Transition = { type: 'spring', stiffness: 420, damping: 36 };

/** Dropdowns and popovers: fade + drop 6px + settle from 98% scale. */
export const popover: Variants = {
  hidden: { opacity: 0, y: -6, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.2, ease: EASE_OUT } },
  exit: { opacity: 0, y: -4, scale: 0.98, transition: { duration: 0.14, ease: 'easeIn' } },
};

/** Generic fade-up used for swapped content. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
  exit: { opacity: 0, y: 6, transition: { duration: 0.15 } },
};

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

// ── Viewport detection ──────────────────────────────────────────

/** True once the element has scrolled into view (stays true when `once`). */
export function useInView<T extends Element>(ref: RefObject<T | null>, { once = true, rootMargin = '0px 0px -10% 0px' }: { once?: boolean; rootMargin?: string } = {}) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          if (once) io.disconnect();
        } else if (!once) setInView(false);
      },
      { rootMargin, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, rootMargin]);
  return inView;
}

// ── Page sections revealed on scroll ────────────────────────────

/**
 * Wraps a page. Each top-level section fades/rises in as it enters the viewport; sections that are
 * already visible on arrival stagger in order. Sections added later (e.g. a notice that appears when a run
 * finishes) animate in too. Fixed overlays (modals, lightbox) are left alone.
 */
export function PageReveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        visible.forEach((e, i) => {
          const el = e.target as HTMLElement;
          io.unobserve(el);
          el.style.setProperty('--reveal-delay', `${Math.min(i, 6) * 70}ms`);
          el.dataset.reveal = 'in';
          const done = (ev: AnimationEvent) => {
            if (ev.target !== el) return;
            el.removeEventListener('animationend', done);
            delete el.dataset.reveal;
            el.style.removeProperty('--reveal-delay');
          };
          el.addEventListener('animationend', done);
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.01 },
    );

    const prepare = (node: Node) => {
      // Re-observe 'pending' nodes: StrictMode (and remounts) tear down the first observer before it fires.
      if (!(node instanceof HTMLElement) || (node.dataset.reveal && node.dataset.reveal !== 'pending')) return;
      if (getComputedStyle(node).position === 'fixed') return;
      node.dataset.reveal = 'pending';
      io.observe(node);
    };
    Array.from(root.children).forEach(prepare);
    const mo = new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(prepare)));
    mo.observe(root, { childList: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}

// ── Count-up numbers ────────────────────────────────────────────

const defaultFormat = (n: number) => Math.round(n).toLocaleString();

/**
 * Animates a number from 0 (first time it is seen) or from its previous value (on updates).
 * Safe under reduced motion: only the digits change.
 */
export function CountUp({ value, duration = 900, format = defaultFormat, className }: { value: number; duration?: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref);
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const current = useRef(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const a = from.current;
    const b = value;
    if (a === b) {
      setShown(b);
      return;
    }
    // Small live updates (e.g. +1 test) tween quickly; the first count from zero takes the full duration.
    const d = a === 0 ? duration : Math.min(duration, 450);
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / d);
      const eased = 1 - Math.pow(1 - p, 3);
      current.current = a + (b - a) * eased;
      setShown(current.current);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = current.current;
    };
  }, [value, inView, duration]);

  return (
    <span ref={ref} className={className} aria-label={format(value)}>
      <span aria-hidden>{format(shown)}</span>
    </span>
  );
}

// ── Images that fade in once loaded ─────────────────────────────

export function RevealImg({ className, onLoad, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (ref.current?.complete) setLoaded(true);
  }, [props.src]);
  return (
    <img
      ref={ref}
      {...props}
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
      data-loaded={loaded || undefined}
      className={cx('img-reveal', className)}
    />
  );
}
