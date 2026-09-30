'use client';
import { useMemo, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { parseReviewHands } from '@/lib/parser/review-hands';

export function ReviewView() {
  const { reviewHands, addReviewHands, updateReviewHand, deleteReviewHand } = useAppStore();
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('Toutes');
  const [status, setStatus] = useState('À revoir');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const categories = useMemo(() => ['Toutes', ...new Set(reviewHands.flatMap(hand => hand.tags))].sort((a, b) => a === 'Toutes' ? -1 : b === 'Toutes' ? 1 : a.localeCompare(b)), [reviewHands]);
  const filtered = useMemo(() => reviewHands.filter(hand =>
    (category === 'Toutes' || hand.tags.includes(category)) &&
    (status === 'Toutes' || hand.reviewed === (status === 'Revues')) &&
    (!query || `${hand.heroCards} ${hand.position} ${hand.handId} ${hand.note} ${hand.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  ), [reviewHands, category, status, query]);
  const selected = reviewHands.find(hand => hand.id === selectedId) ?? null;
  const pending = reviewHands.filter(hand => !hand.reviewed).length;

  const importHands = () => {
    const parsed = parseReviewHands(input);
    if (!parsed.length) { setMessage('Aucune main Winamax valide trouvée. Colle une histoire complète avec « Dealt to » et « PRE-FLOP ».'); return; }
    const added = addReviewHands(parsed);
    setMessage(`${added} main${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}${parsed.length - added ? ` · ${parsed.length - added} déjà présente${parsed.length - added > 1 ? 's' : ''}` : ''}.`);
    if (added) { setInput(''); setSelectedId(parsed[0].id); }
  };

  const exportHands = () => {
    const blob = new Blob([JSON.stringify(reviewHands, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mains-a-revoir.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="flex-1 overflow-y-auto bg-bg px-3 py-5 sm:px-6">
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="section-label">Journal de session</p><h1 className="text-2xl font-bold mt-1">Mains à revoir</h1><p className="text-sm text-muted mt-1">Colle tes mains Winamax. Les spots sont classés automatiquement.</p></div>
        <div className="flex gap-2 items-center"><span className="text-xs rounded-full bg-orange/15 text-orange px-3 py-1.5">{pending} à revoir</span><span className="text-xs rounded-full bg-bg3 text-muted px-3 py-1.5">{reviewHands.length} au total</span></div>
      </div>

      <section className="rounded-xl border border-border bg-bg2 p-4 sm:p-5">
        <label htmlFor="hand-paste" className="block text-sm font-semibold mb-2">Coller une ou plusieurs mains</label>
        <textarea id="hand-paste" value={input} onChange={event => setInput(event.target.value)} rows={6} placeholder="Winamax Poker - CashGame - HandId: #..." className="w-full resize-y rounded-lg bg-bg3 border border-border p-3 text-xs leading-relaxed text-text placeholder-muted focus:border-accent" />
        <div className="flex flex-wrap items-center gap-3 mt-3"><button type="button" onClick={importHands} disabled={!input.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Ajouter à la revue</button><p role="status" className="text-xs text-muted">{message || 'Les doublons sont ignorés grâce au HandId.'}</p></div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <select aria-label="Catégorie" value={category} onChange={event => setCategory(event.target.value)} className="control text-xs">{categories.map(tag => <option key={tag}>{tag}</option>)}</select>
          <select aria-label="Statut" value={status} onChange={event => setStatus(event.target.value)} className="control text-xs">{['À revoir', 'Revues', 'Toutes'].map(value => <option key={value}>{value}</option>)}</select>
          <input aria-label="Rechercher une main" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cartes, position, HandId, note…" className="control text-xs min-w-[220px] flex-1" />
          {reviewHands.length > 0 && <button type="button" onClick={exportHands} className="control text-xs">Exporter JSON</button>}
        </div>
        {filtered.length === 0 ? <div className="rounded-xl border border-dashed border-border2 py-12 text-center text-sm text-muted">{reviewHands.length ? 'Aucune main pour ces filtres.' : 'Ta première main apparaîtra ici.'}</div> :
          <div className="grid gap-3 lg:grid-cols-2">{filtered.map(hand => <button key={hand.id} type="button" onClick={() => setSelectedId(hand.id)} className={`rounded-xl border p-4 text-left transition-colors ${selectedId === hand.id ? 'border-accent bg-accent/5' : 'border-border bg-bg2 hover:border-border2'}`}>
            <div className="flex items-center justify-between gap-2"><span className="font-semibold text-sm">{hand.heroCards} <span className="text-muted font-normal">· {hand.position}</span></span><span className={`text-[11px] ${hand.reviewed ? 'text-green' : 'text-orange'}`}>{hand.reviewed ? 'Revue' : 'À revoir'}</span></div>
            <p className="mt-1 text-xs text-muted">{hand.playedAt || 'Date inconnue'} · {hand.stakes} · #{hand.handId}</p>
            <div className="flex flex-wrap gap-1 mt-3">{hand.tags.map(tag => <span key={tag} className="rounded bg-bg3 px-2 py-1 text-[11px] text-muted">{tag}</span>)}</div>
            {hand.note && <p className="text-xs text-text mt-3 line-clamp-2">{hand.note}</p>}
          </button>)}</div>}
      </section>

      {selected && <section className="rounded-xl border border-accent/40 bg-bg2 p-4 sm:p-5 space-y-4">
        <div className="flex justify-between items-start gap-3"><div><h2 className="font-semibold">Main #{selected.handId}</h2><p className="text-xs text-muted mt-1">{selected.hero} · {selected.heroCards} · {selected.position}</p></div><button type="button" onClick={() => setSelectedId(null)} aria-label="Fermer la main" className="text-muted hover:text-text">✕</button></div>
        <div className="flex flex-wrap gap-2">{selected.tags.map(tag => <span key={tag} className="rounded-full bg-accent/15 px-2.5 py-1 text-xs text-accent">{tag}</span>)}</div>
        <details><summary className="cursor-pointer text-sm font-medium">Historique complet</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-bg3 p-4 text-xs leading-relaxed text-text">{selected.raw}</pre></details>
        <div><label htmlFor="review-note" className="block text-sm font-medium mb-2">Note de revue</label><textarea id="review-note" rows={3} value={selected.note} onChange={event => updateReviewHand(selected.id, { note: event.target.value })} placeholder="Décision, question, piste de travail…" className="w-full resize-y rounded-lg bg-bg3 border border-border p-3 text-sm text-text focus:border-accent" /></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => updateReviewHand(selected.id, { reviewed: !selected.reviewed })} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">{selected.reviewed ? 'Remettre à revoir' : 'Marquer comme revue'}</button><button type="button" onClick={() => { if (window.confirm('Supprimer cette main du carnet ?')) { deleteReviewHand(selected.id); setSelectedId(null); } }} className="rounded-lg border border-red/40 px-4 py-2 text-sm text-red">Supprimer</button></div>
      </section>}
      <p className="text-xs text-muted">Les mains sont conservées dans ce navigateur. Exporte régulièrement ton carnet pour en garder une copie.</p>
    </div>
  </div>;
}
