'use client';
import { useEffect } from 'react';
import clsx from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, children, className }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={clsx(
          'bg-bg2 border border-border2 rounded-lg p-6 w-[92%] max-w-[420px]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[15px] font-bold mb-1.5">{children}</h3>;
}

export function ModalBody({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted leading-relaxed mb-4">{children}</p>;
}

export function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="flex gap-2 justify-center">{children}</div>;
}
