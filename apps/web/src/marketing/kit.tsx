import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { motion, type Variants } from 'motion/react';
import { Eye } from 'lucide-react';
import { cx } from '../components/ui';

export const EASE = [0.22, 1, 0.36, 1] as const;

/** Wordmark: forest tile with a terracotta scan line and a sage dot. */
export function Logo({ to = '/', light = false, onClick }: { to?: string; light?: boolean; onClick?: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="group flex items-center gap-2.5" aria-label="Autonomous Web Tester home">
      <span className={cx('relative grid size-8 place-items-center overflow-hidden rounded-[9px]', light ? 'bg-paper' : 'bg-forest')}>
        <span className="absolute inset-x-1.5 top-1/2 h-[2px] -translate-y-1/2 rounded-full bg-terra transition-transform duration-500 group-hover:translate-y-[-5px]" />
        <span className={cx('size-3.5 rounded-[3px] border-2', light ? 'border-coal' : 'border-ivory')} />
        <span className="absolute right-1 top-1 size-1.5 rounded-full bg-sage" />
      </span>
      <span className={cx('font-display text-[15px] font-bold tracking-tight', light ? 'text-paper' : 'text-coal')}>
        Autonomous Web Tester
      </span>
    </Link>
  );
}

type MVariant = 'primary' | 'accent' | 'glass' | 'secondary' | 'ghost' | 'light' | 'outlineLight';
const mv: Record<MVariant, string> = {
  primary: 'bg-forest text-ivory shadow-[0_10px_24px_-12px_rgba(32,55,45,0.75)] hover:-translate-y-0.5 hover:bg-forest-2 hover:shadow-[0_16px_30px_-14px_rgba(32,55,45,0.8)] [&_svg]:text-sage',
  accent: 'bg-terra text-white shadow-[0_10px_24px_-12px_rgba(201,111,74,0.85)] hover:-translate-y-0.5 hover:bg-ember-dark',
  glass: 'glass text-coal hover:-translate-y-0.5 hover:bg-white/80',
  secondary: 'border border-coal/15 bg-white/70 text-coal backdrop-blur hover:-translate-y-0.5 hover:border-coal/35 hover:bg-white',
  ghost: 'text-coal/70 hover:text-coal',
  light: 'bg-ivory text-forest hover:-translate-y-0.5 hover:bg-white',
  outlineLight: 'border border-ivory/25 text-ivory hover:-translate-y-0.5 hover:border-ivory/60 hover:bg-white/5',
};

export function MLink({ variant = 'primary', size = 'md', className, children, ...p }: LinkProps & { variant?: MVariant; size?: 'md' | 'lg' }) {
  return (
    <Link
      {...p}
      className={cx(
        'group/btn inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra active:translate-y-0 active:scale-[0.97] active:duration-100 [&_svg]:transition-transform [&_svg]:duration-300 hover:[&_svg:last-child]:translate-x-1',
        size === 'lg' ? 'h-12 px-6 text-[15px]' : 'h-10 px-4 text-sm',
        mv[variant],
        className,
      )}
    >
      {children}
    </Link>
  );
}

const TAGS = { div: motion.div, li: motion.li, section: motion.section, ol: motion.ol, ul: motion.ul, p: motion.p } as const;
const VIEW = { once: true, margin: '0px 0px -12% 0px' } as const;

/**
 * Reveals once on scroll: blur → sharp and fade-in always run (visible with reduced motion);
 * the slide-up is dropped by MotionConfig when reduced motion is on.
 */
export function Reveal({ children, className, delay = 0, as = 'div', y = 32, id }: { children: ReactNode; className?: string; delay?: number; as?: keyof typeof TAGS; y?: number; id?: string }) {
  const Tag = TAGS[as];
  return (
    <Tag
      id={id}
      className={className}
      initial={{ opacity: 0, y, filter: 'blur(10px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={VIEW}
      transition={{ duration: 1, ease: EASE, delay: delay / 1000 }}
    >
      {children}
    </Tag>
  );
}

export const stagger = (gap = 0.1, delayChildren = 0): Variants => ({ hidden: {}, show: { transition: { staggerChildren: gap, delayChildren } } });
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 32, filter: 'blur(8px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.9, ease: EASE } },
};

export function Stagger({ children, className, gap = 0.1, as = 'div' }: { children: ReactNode; className?: string; gap?: number; as?: keyof typeof TAGS }) {
  const Tag = TAGS[as];
  return (
    <Tag className={className} variants={stagger(gap)} initial="hidden" whileInView="show" viewport={VIEW}>
      {children}
    </Tag>
  );
}

export function StaggerItem({ children, className, as = 'div' }: { children: ReactNode; className?: string; as?: keyof typeof TAGS }) {
  const Tag = TAGS[as];
  return <Tag className={className} variants={fadeUp}>{children}</Tag>;
}

/** Section label, e.g. "01 — How it works", with a line that draws in. */
export function Label({ n, children, dark }: { n?: string; children: ReactNode; dark?: boolean }) {
  return (
    <p className={cx('flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.18em]', dark ? 'text-ivory/55' : 'text-stone')}>
      {n && <span className={dark ? 'text-sage' : 'text-terra'}>{n}</span>}
      {n && (
        <motion.span aria-hidden className={cx('h-px w-8', dark ? 'bg-ivory/30' : 'bg-coal/25')} initial={{ width: 0 }} whileInView={{ width: 32 }} viewport={VIEW} transition={{ duration: 0.9, ease: EASE, delay: 0.2 }} />
      )}
      {children}
    </p>
  );
}

/** Emphasised word in serif italic. */
export function Serif({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('font-serif font-normal italic tracking-[-0.01em]', className)}>{children}</span>;
}

export function SectionHeading({ n, eyebrow, title, description, dark, className, center }: { n?: string; eyebrow: string; title: ReactNode; description?: ReactNode; dark?: boolean; className?: string; center?: boolean }) {
  if (center) {
    return (
      <div className={cx('mx-auto max-w-3xl text-center', className)}>
        <Reveal className="flex justify-center"><Label n={n} dark={dark}>{eyebrow}</Label></Reveal>
        <Reveal delay={80} className={cx('mt-5 font-display text-[34px] font-bold leading-[1.06] tracking-[-0.035em] text-balance sm:text-5xl lg:text-[54px]', dark ? 'text-ivory' : 'text-coal')}><h2>{title}</h2></Reveal>
        {description && <Reveal delay={180} as="p" className={cx('mx-auto mt-5 max-w-xl text-base leading-relaxed lg:text-[17px]', dark ? 'text-ivory/65' : 'text-stone')}>{description}</Reveal>}
      </div>
    );
  }
  return (
    <div className={cx('grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-10', className)}>
      <Reveal className="lg:col-span-8">
        <Label n={n} dark={dark}>{eyebrow}</Label>
        <h2 className={cx('mt-5 font-display text-[34px] font-bold leading-[1.06] tracking-[-0.035em] text-balance sm:text-5xl lg:text-[54px]', dark ? 'text-ivory' : 'text-coal')}>{title}</h2>
      </Reveal>
      {description && <Reveal delay={120} as="p" className={cx('text-base leading-relaxed lg:col-span-4 lg:self-end lg:text-[17px]', dark ? 'text-ivory/65' : 'text-stone')}>{description}</Reveal>}
    </div>
  );
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-7xl px-5 sm:px-8', className)}>{children}</div>;
}

/** Marks a mockup as a product preview built with sample data — never a real result. */
export function PreviewBadge({ className, label = 'Product preview · sample data', dark }: { className?: string; label?: string; dark?: boolean }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[11px] font-medium', dark ? 'text-ivory/50' : 'text-stone', className)}>
      <Eye className="size-3.5" />
      {label}
    </span>
  );
}

/** Frosted-glass application window for product mockups. */
export function AppFrame({ title, children, className, right }: { title: ReactNode; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <div className={cx('glass glass-sheen rounded-2xl', className)}>
      <div className="flex items-center gap-3 border-b border-white/70 bg-white/35 px-4 py-2.5">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-terra/70" />
          <span className="size-2.5 rounded-full bg-[#d9b56a]/80" />
          <span className="size-2.5 rounded-full bg-sage" />
        </div>
        <div className="mx-auto min-w-0 overflow-hidden whitespace-nowrap rounded-full bg-white/55 px-3 py-0.5 text-[11px] font-medium text-stone">{title}</div>
        <span className="min-w-10 text-right">{right}</span>
      </div>
      {children}
    </div>
  );
}
