'use client';
import { useCallback, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

export function DrillExplanation({ text, label = 'Comprendre le raisonnement' }: { text: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <><button className="drill-explanation-trigger" onClick={() => setOpen(true)}>{label} ↗</button>
    <Modal open={open} onClose={close} className="drill-explanation-dialog"><div className="drill-reference-header"><h2>{label}</h2><Button size="sm" onClick={close} aria-label="Fermer l’explication">Fermer</Button></div><p className="whitespace-pre-line text-sm text-muted leading-relaxed">{text}</p></Modal>
  </>;
}

export function DrillMemoDeck({ title, description, pages, footer }: {
  title: string; description?: string; pages: { id: string; title: string; content: React.ReactNode }[]; footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const close = useCallback(() => setOpen(false), []);
  const page = pages.find(item => item.id === selected) ?? pages[0];
  return <div className="drill-reference-launch"><Button size="sm" onClick={() => setOpen(true)}>Fiches mémo ↗</Button>
    <Modal open={open} onClose={close} className="drill-reference-dialog">
      <div className="drill-reference-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div><Button size="sm" onClick={close} aria-label="Fermer les fiches mémo">Fermer</Button></div>
      <label className="drill-reference-selector">Fiche à consulter<select className="cbet-select" value={page?.id ?? ''} onChange={event => setSelected(event.target.value)}>{pages.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <section className="drill-reference-page" aria-label={page?.title}>{page?.content}</section>
      {footer && <div className="drill-reference-footer">{footer}</div>}
    </Modal>
  </div>;
}
