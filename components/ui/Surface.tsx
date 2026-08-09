import clsx from 'clsx';

export function Surface({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={clsx('bg-bg2 border border-border rounded-xl shadow-[0_12px_40px_rgba(0,0,0,0.12)]', className)}>{children}</section>;
}

export function SectionHeading({ eyebrow, title, description, action }: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent mb-1">{eyebrow}</div>}
        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-text">{title}</h2>
        {description && <p className="text-xs sm:text-sm text-muted mt-1.5 leading-relaxed max-w-2xl">{description}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, detail, tone = 'default' }: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  tone?: 'default' | 'positive' | 'negative' | 'warning';
}) {
  const toneClass = tone === 'positive' ? 'text-green' : tone === 'negative' ? 'text-red' : tone === 'warning' ? 'text-orange' : 'text-text';
  return (
    <Surface className="p-4 sm:p-5 min-w-0">
      <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted">{label}</div>
      <div className={clsx('text-2xl sm:text-3xl font-bold tracking-tight mt-1', toneClass)}>{value}</div>
      {detail && <div className="text-xs text-muted mt-1">{detail}</div>}
    </Surface>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={clsx('animate-pulse rounded-lg bg-gradient-to-r from-bg3 via-bg4 to-bg3 bg-[length:200%_100%]', className)} />;
}
