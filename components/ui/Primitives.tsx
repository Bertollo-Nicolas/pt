import clsx from 'clsx';
import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={clsx('control w-full text-xs placeholder:text-muted2', className)} {...props}/>;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx('control text-xs', className)} {...props}>{children}</select>;
}

export function Badge({ children, tone = 'neutral', className }: { children: React.ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'; className?: string }) {
  const tones = { neutral: 'bg-bg3 border-border text-muted', accent: 'bg-accent/15 border-accent/30 text-accent', success: 'bg-green/10 border-green/30 text-green', warning: 'bg-orange/10 border-orange/30 text-orange', danger: 'bg-red/10 border-red/30 text-red' };
  return <span className={clsx('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', tones[tone], className)}>{children}</span>;
}

export function IconButton({ icon, label, className, ...props }: { icon: IconName; label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button aria-label={label} title={label} className={clsx('w-9 h-9 rounded-lg border border-border text-muted hover:text-text hover:border-border2 hover:bg-bg3 flex items-center justify-center transition-colors', className)} {...props}><Icon name={icon} size={16}/></button>;
}

export function EmptyState({ icon, title, description, action }: { icon: IconName; title: string; description: string; action?: React.ReactNode }) {
  return <div className="py-10 px-5 text-center"><div className="mx-auto w-14 h-14 rounded-2xl bg-accent/15 text-accent flex items-center justify-center"><Icon name={icon} size={27}/></div><h3 className="text-base font-semibold text-text mt-4">{title}</h3><p className="text-xs text-muted max-w-md mx-auto mt-2 leading-relaxed">{description}</p>{action && <div className="mt-4">{action}</div>}</div>;
}
