'use client';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
}

const variantClasses: Record<Variant, string> = {
  primary:   'bg-accent border-accent text-white hover:opacity-90',
  secondary: 'bg-transparent border-border text-muted hover:text-text hover:border-border2',
  danger:    'bg-red/5 border-red/30 text-red hover:bg-red/10',
  ghost:     'bg-transparent border-transparent text-muted hover:text-text',
};

const sizeClasses = {
  sm: 'min-h-8 px-2.5 py-1 text-[11px]',
  md: 'min-h-9 px-3 py-1.5 text-xs',
};

export function Button({ variant = 'secondary', size = 'md', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={clsx(
        'rounded border font-semibold cursor-pointer transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-35 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
