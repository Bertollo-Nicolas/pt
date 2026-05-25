'use client';
import clsx from 'clsx';

interface ToggleProps {
  on: boolean;
  onToggle: () => void;
  label: string;
}

export function Toggle({ on, onToggle, label }: ToggleProps) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer select-none">
      <span>{label}</span>
      <div
        onClick={onToggle}
        className={clsx(
          'relative w-[30px] h-[17px] rounded-full border transition-colors duration-200',
          on ? 'bg-accent border-accent toggle-on' : 'bg-bg3 border-border2',
        )}
      >
        <div className="toggle-knob" />
      </div>
    </label>
  );
}
