'use client';
import { useEffect, useRef } from 'react';
import clsx from 'clsx';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export function Modal({ open, onClose, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    const focusable = dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    (focusable?.[0] ?? dialog)?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !dialog) return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-[2px] flex items-center justify-center z-50 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Fenêtre modale"
        tabIndex={-1}
        className={clsx(
          'bg-bg2 border border-border2 rounded-lg p-5 sm:p-6 w-full max-w-[420px] shadow-2xl max-h-[90vh] overflow-y-auto',
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
