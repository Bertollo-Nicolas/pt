'use client';
import clsx from 'clsx';

interface ToggleProps {
  on: boolean;
  onToggle: () => void;
  label: string;
}

export function Toggle({ on, onToggle, label }: ToggleProps) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted select-none">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
        className={clsx(
          'relative w-[34px] h-5 rounded-full border transition-colors duration-200 cursor-pointer',
          on ? 'bg-accent border-accent toggle-on' : 'bg-bg3 border-border2',
        )}
      >
        <div className="toggle-knob" />
      </button>
    </div>
  );
}
