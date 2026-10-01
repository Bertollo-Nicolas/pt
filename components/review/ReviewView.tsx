'use client';
import { useCallback, useMemo, useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { parseReviewHands } from '@/lib/parser/review-hands';
import type { ReviewHand } from '@/lib/types';
import { HandReplayer, HeroCards } from './HandReplayer';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Modal, ModalTitle, ModalBody } from '@/components/ui/Modal';

export function ReviewView() {
  const { reviewHands, addReviewHands, updateReviewHand, deleteReviewHand } = useAppStore();
  const [input, setInput] = useState('');
  const [message, setMessage] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [category, setCategory] = useState('Toutes');
  const [status, setStatus] = useState('À revoir');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const closeImport = useCallback(() => setImportOpen(false), []);
  // Filters deliberately exclude outcome/postflop tags to keep the review blind.
  const safeTags = (hand: ReviewHand) => hand.tags.filter(tag => ['Multiway', 'Pot limpé', 'Relance préflop', 'Call préflop'].includes(tag));
  const categories = ['Toutes', ...new Set(reviewHands.flatMap(safeTags))];
  const filtered = useMemo(() => reviewHands.filter(hand =>
    (category === 'Toutes' || hand.tags.includes(category)) &&
    (status === 'Toutes' || hand.reviewed === (status === 'Revues')) &&
    (!query || `${hand.heroCards} ${hand.position} ${hand.handId} ${hand.note} ${hand.doubt ?? ''} ${hand.conclusion ?? ''} ${hand.workOn ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  ), [reviewHands, category, status, query]);
  const selected = filtered.find(hand => hand.id === selectedId) ?? filtered[0] ?? null;
  const selectedIndex = selected ? filtered.findIndex(hand => hand.id === selected.id) : -1;
  const pending = reviewHands.filter(hand => !hand.reviewed).length;
  const select = (id: string) => { setSelectedId(id); setQueueOpen(false); };
  const neighbor = () => filtered[selectedIndex + 1]?.id ?? filtered[selectedIndex - 1]?.id ?? null;
  const changeStatus = () => {
    if (!selected) return;
    setSelectedId(neighbor());
    updateReviewHand(selected.id, { reviewed: !selected.reviewed });
  };
  const remove = () => {
    if (!selected || !window.confirm('Supprimer cette main du carnet ?')) return;
    setSelectedId(neighbor());
    deleteReviewHand(selected.id);
  };
  const importHands = () => {
    const parsed = parseReviewHands(input);
    if (!parsed.length) { setMessage('Aucune main Winamax valide. Ajoute un historique avec les cartes du joueur et la section PRE-FLOP.'); return; }
    const newHand = parsed.find(hand => !reviewHands.some(existing => existing.id === hand.id));
    const added = addReviewHands(parsed);
    setMessage(`${added} main${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}${parsed.length - added ? ` · ${parsed.length - added} doublon(s) ignoré(s)` : ''}.`);
    if (added && newHand) {
      setInput(''); setQuery(''); setCategory('Toutes'); setStatus('À revoir');
      select(newHand.id); setImportOpen(false);
    }
  };
  const exportHands = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(reviewHands, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'mains-a-revoir.json'; link.click(); URL.revokeObjectURL(url);
  };
  return <div className="review-workspace">
    <header className="review-page-heading"><div><p className="eyebrow">OBSERVER / COMPRENDRE / PROGRESSER</p><h1>Revue de mains</h1></div><div className="review-heading-actions"><Button aria-expanded={queueOpen} onClick={() => setQueueOpen(!queueOpen)}><Icon name="menu" size={15} className="inline-block mr-2"/>File de revue · {filtered.length}</Button>{reviewHands.length > 0 && <Button onClick={exportHands}>Exporter</Button>}<Button variant="primary" onClick={() => { setMessage(''); setImportOpen(true); }}><Icon name="upload" size={15} className="inline-block mr-2"/>Importer des mains</Button></div></header>
    <div className={`review-columns ${queueOpen ? 'queue-open' : ''}`}>
      {queueOpen && <button className="review-queue-scrim" aria-label="Fermer la file de revue" onClick={() => setQueueOpen(false)}/>}
      <aside className="review-queue" aria-label="File de revue">
        <div className="queue-heading"><h2>Ta file de revue</h2><span>{pending} à revoir</span><button className="queue-close" aria-label="Fermer la file" onClick={() => setQueueOpen(false)}><Icon name="close" size={16}/></button></div>
        <div className="queue-filters"><div className="queue-search"><Icon name="search" size={16}/><input aria-label="Rechercher une main" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cartes, position, note…"/></div><div className="flex gap-2"><select aria-label="Statut des mains" value={status} onChange={event => setStatus(event.target.value)} className="control flex-1 min-w-0 text-xs">{['À revoir', 'Revues', 'Toutes'].map(value => <option key={value}>{value}</option>)}</select><select aria-label="Type de spot" value={category} onChange={event => setCategory(event.target.value)} className="control flex-1 min-w-0 text-xs">{categories.map(tag => <option key={tag}>{tag}</option>)}</select></div></div>
        <div className="queue-list">{filtered.map(hand => <button key={hand.id} aria-current={selected?.id === hand.id ? 'true' : undefined} className={`queue-hand ${selected?.id === hand.id ? 'selected' : ''}`} onClick={() => select(hand.id)}><div className="queue-hand-top"><HeroCards value={hand.heroCards}/><span className="queue-position">{hand.position}</span><span className={`queue-status ${hand.reviewed ? 'done' : ''}`}>{hand.reviewed ? 'Revue' : 'À revoir'}</span></div><span className="queue-hand-meta">{hand.stakes || 'Limite non renseignée'} · {hand.playedAt || 'Date non renseignée'}</span><span className="queue-hand-id">#{hand.handId}</span>{safeTags(hand).length > 0 && <span className="queue-tags">{safeTags(hand).map(tag => <span key={tag}>{tag}</span>)}</span>}{(hand.doubt || hand.note) && <span className="queue-note"><Icon name="info" size={12}/>Annotation enregistrée</span>}</button>)}
        {!filtered.length && <div className="queue-empty"><Icon name={reviewHands.length ? 'search' : 'folder'} size={25}/><h3>{reviewHands.length ? 'Aucune main dans cette file.' : 'Ta première main t’attend.'}</h3><p>{reviewHands.length ? 'Change les filtres pour retrouver tes autres mains.' : 'Importe un historique Winamax pour commencer.'}</p><Button onClick={() => { if (reviewHands.length) { setStatus('Toutes'); setQuery(''); setCategory('Toutes'); } else setImportOpen(true); }}>{reviewHands.length ? 'Voir toutes les mains' : 'Importer des mains'}</Button></div>}
        </div><div className="queue-footer">{filtered.length} / {reviewHands.length} mains · sauvegarde locale</div>
      </aside>
      <section className="review-detail" aria-label="Analyse de la main">
        {selected ? <ReviewDetail key={selected.id} hand={selected} index={selectedIndex} total={filtered.length} onPrevious={() => select(filtered[selectedIndex - 1].id)} onNext={() => select(filtered[selectedIndex + 1].id)} onStatus={changeStatus} onDelete={remove} onUpdate={updates => updateReviewHand(selected.id, updates)}/> : <div className="review-no-selection"><span className="practice-icon"><Icon name="search" size={24}/></span><h2>Prends le temps de comprendre.</h2><p>Sélectionne une main dans ta file pour la rejouer, noter ton raisonnement et en tirer une leçon.</p><div className="review-empty-steps"><span>01 · Rejouer</span><span>02 · Analyser</span><span>03 · Retenir</span></div></div>}
      </section>
    </div>
    <p role="status" className="review-storage-note">{!importOpen && message ? `${message} ` : ''}Ton carnet est conservé dans ce navigateur. Exporte-le régulièrement pour garder une copie.</p>
    <Modal open={importOpen} onClose={closeImport} className="max-w-[640px]"><ModalTitle>Ajouter des mains à ta file</ModalTitle><ModalBody>Colle un ou plusieurs historiques Winamax. Les doublons sont ignorés et tes annotations existantes sont conservées.</ModalBody><label htmlFor="hand-paste" className="text-sm block mb-2">Historique des mains</label><textarea id="hand-paste" value={input} onChange={event => setInput(event.target.value)} rows={10} placeholder="Winamax Poker - CashGame - HandId: #…" className="control w-full text-xs resize-y"/><p role="status" className="text-xs text-muted my-3">{message}</p><div className="flex justify-end gap-2"><Button onClick={closeImport}>Annuler</Button><Button variant="primary" onClick={importHands} disabled={!input.trim()}>Ajouter à la revue</Button></div></Modal>
  </div>;
}

type Annotation = Partial<Pick<ReviewHand, 'note' | 'doubt' | 'conclusion' | 'workOn'>>;
function ReviewDetail({ hand, index, total, onPrevious, onNext, onStatus, onDelete, onUpdate }: { hand: ReviewHand; index: number; total: number; onPrevious: () => void; onNext: () => void; onStatus: () => void; onDelete: () => void; onUpdate: (updates: Annotation) => void }) {
  const [revealed, setRevealed] = useState(false);
  const [panel, setPanel] = useState<'replay' | 'notes'>('replay');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);
  const closeLegacy = useCallback(() => setLegacyOpen(false), []);
  return <>
    <div className="review-detail-bar">
      <div className="detail-hand-title"><HeroCards value={hand.heroCards}/><div><span className="eyebrow">MAIN {index + 1} / {total}</span><h2>{hand.hero}<span> · {hand.position}</span></h2></div></div>
      <div className="detail-view-tabs" aria-label="Panneau de la main"><button aria-pressed={panel === 'replay'} onClick={() => setPanel('replay')}>Table</button><button aria-pressed={panel === 'notes'} onClick={() => setPanel('notes')}>Mes notes</button></div>
      <div className="flex gap-2"><button className="icon-control" disabled={index === 0} onClick={onPrevious} aria-label="Main précédente"><Icon name="chevron" className="rotate-180" size={17}/></button><button className="icon-control" disabled={index === total - 1} onClick={onNext} aria-label="Main suivante"><Icon name="chevron" size={17}/></button></div>
    </div>
    <div className={`review-analysis-grid panel-${panel}`}>
      <HandReplayer hand={hand} revealed={revealed} onReveal={setRevealed}/>
      <section className="review-annotations" aria-label="Notes de la main">
        <div className="annotation-heading"><div><span className="eyebrow">TON ANALYSE</span><h3>Qu’en retiens-tu ?</h3></div><span className="note-save-state"><span/>Sauvegarde locale</span></div>
        <div className="annotation-fields">{([{ key: 'doubt', number: '01', label: 'Mon doute', placeholder: 'La décision qui te fait hésiter…' }, { key: 'conclusion', number: '02', label: 'Ma conclusion', placeholder: 'La décision que tu retiens et pourquoi…' }, { key: 'workOn', number: '03', label: 'À travailler', placeholder: 'Un spot, une règle ou un exercice à revoir…' }] as const).map(field => <div className="annotation-field" key={field.key}><label htmlFor={`review-${field.key}`}><span>{field.number}</span>{field.label}</label><textarea id={`review-${field.key}`} value={hand[field.key] ?? ''} onChange={event => onUpdate({ [field.key]: event.target.value })} placeholder={field.placeholder}/></div>)}</div>
        <div className="annotation-links">{hand.note && <button onClick={() => setLegacyOpen(true)}>Note précédente</button>}<button onClick={() => setHistoryOpen(true)}>Historique texte</button></div>
        <div className="review-detail-footer"><button className="text-xs text-muted hover:text-red" onClick={onDelete}>Supprimer</button><Button variant="primary" onClick={onStatus}>{hand.reviewed ? 'Remettre à revoir' : 'Valider la revue'}{index < total - 1 && <span className="ml-2">→</span>}</Button></div>
      </section>
    </div>
    <Modal open={historyOpen} onClose={closeHistory} className="max-w-[760px]"><ModalTitle>Historique de la main</ModalTitle>{revealed ? <><div className="queue-tags mt-3">{hand.tags.map(tag => <span key={tag}>{tag}</span>)}</div><pre className="review-raw-text">{hand.raw}</pre></> : <><ModalBody>L’historique complet contient les cartes montrées et le résultat de la main.</ModalBody><Button variant="primary" onClick={() => setRevealed(true)}>Révéler et ouvrir l’historique</Button></>}<div className="mt-4 flex justify-end"><Button onClick={closeHistory}>Fermer</Button></div></Modal>
    <Modal open={legacyOpen} onClose={closeLegacy}><ModalTitle>Note précédente</ModalTitle><textarea aria-label="Note précédente" rows={8} value={hand.note} onChange={event => onUpdate({ note: event.target.value })} className="control w-full mt-3 text-sm"/><div className="mt-4 flex justify-end"><Button onClick={closeLegacy}>Fermer</Button></div></Modal>
  </>;
}
