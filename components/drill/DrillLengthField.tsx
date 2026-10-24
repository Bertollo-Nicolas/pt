'use client';
import { useId, useState } from 'react';

export function useDrillLength(defaultCount: number) {
  const [draft, setDraft] = useState<string | null>(null);
  const getCount = (fallback = defaultCount): number | null => {
    if (draft === null) return fallback;
    const value = Number(draft);
    return /^\d+$/.test(draft) && Number.isSafeInteger(value) && value > 0 ? value : null;
  };
  return { input: draft ?? String(defaultCount), setInput: setDraft, count: getCount(), getCount };
}

export function DrillLengthField({ input, onChange, valid, label, description }: {
  input: string; onChange: (value: string) => void; valid: boolean; label: string; description?: string;
}) {
  const id = useId();
  return <div className="drill-length-field mt-6">
    <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
    <input id={id} type="number" min={1} step={1} value={input} onChange={event => onChange(event.target.value)}
      className="cbet-select !max-w-[180px]" aria-invalid={!valid} aria-describedby={`${id}-help`}/>
    <p id={`${id}-help`} className={`text-xs mt-2 ${valid ? 'text-muted' : 'text-red'}`}>
      {valid ? description ?? 'Choisis librement la longueur de ta session.' : 'Entre un nombre entier supérieur à zéro.'}
    </p>
  </div>;
}
