'use client';
import { useCallback, useMemo, useState } from 'react';
import { buildHandReplay } from '@/lib/parser/hand-replay';
import { historyCards } from '@/lib/parser/hand-history';
import type { ReviewHand } from '@/lib/types';
import { Icon } from '@/components/ui/Icon';
import { Modal, ModalTitle } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

export function HandCards({ cards, hidden = false }: { cards: string[]; hidden?: boolean }) {
  const suits: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
  return <span className="replay-cards">{(hidden ? ['?', '?'] : cards).map((card, index) => {
    const unknown = !hidden && card === '?';
    return <span key={`${card}-${index}`} aria-label={hidden ? 'Carte masquée' : unknown ? 'Carte non disponible' : `${card[0]}${suits[card[1]]}`} className={`replay-card ${hidden ? 'card-hidden' : unknown ? 'card-unavailable' : card[1] === 'H' || card[1] === 'D' ? 'card-red' : ''}`}>{hidden ? '·' : unknown ? '?' : <>{card[0]}<small>{suits[card[1]]}</small></>}</span>;
  })}</span>;
}
export function HeroCards({ value }: { value: string }) { return <HandCards cards={historyCards(value)}/>; }

export function HandReplayer({ hand, revealed, onReveal }: { hand: ReviewHand; revealed: boolean; onReveal: (value: boolean) => void }) {
  const replay = useMemo(() => buildHandReplay(hand.raw, hand.hero, hand.heroCards), [hand.raw, hand.hero, hand.heroCards]);
  const firstResult = replay.frames.findIndex(frame => frame.result);
  const decisionEnd = firstResult < 0 ? replay.frames.length - 1 : firstResult - 1;
  const [step, setStep] = useState(() => Math.max(0, replay.frames.findIndex(frame => frame.street === 'Préflop')));
  const [logOpen, setLogOpen] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const closeLog = useCallback(() => setLogOpen(false), []);
  const closeWarnings = useCallback(() => setWarningsOpen(false), []);
  const last = revealed ? replay.frames.length - 1 : Math.max(0, decisionEnd);
  const activeStep = Math.min(step, last);
  const frame = replay.frames[activeStep];
  const format = (value: number) => `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(replay.bigBlind ? value / replay.bigBlind : value)} ${replay.bigBlind ? 'bb' : 'unités'}`;
  const heroIndex = frame.players.findIndex(player => player.name === hand.hero);
  const ordered = heroIndex >= 0 ? [...frame.players.slice(heroIndex), ...frame.players.slice(0, heroIndex)] : frame.players;
  const streetSteps = replay.frames.map((item, index) => ({ item, index })).filter(({ item, index }) => index <= last && (index === 0 || item.street !== replay.frames[index - 1].street));
  const expectedBoard = frame.street === 'Flop' ? 3 : frame.street === 'Turn' ? 4 : frame.street === 'River' ? 5 : frame.board.length;
  const board = [...frame.board, ...Array(Math.max(0, expectedBoard - frame.board.length)).fill('?')];
  return <section className="hand-replayer" aria-label="Replayer de la main" tabIndex={0} onKeyDown={event => {
    if ((event.target as HTMLElement).matches('input, textarea, select') || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); setStep(Math.min(last, activeStep + 1)); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); setStep(Math.max(0, activeStep - 1)); }
  }}>
    <div className="replayer-heading"><span className="eyebrow">{frame.street.toUpperCase()}</span><div className="replayer-heading-actions">{replay.warnings.length > 0 && <button className="replay-warning-button" onClick={() => setWarningsOpen(true)}><Icon name="info" size={15}/><span>Historique incomplet</span></button>}<button className={`reveal-button ${revealed ? 'is-revealed' : ''}`} onClick={() => { onReveal(!revealed); setStep(revealed ? Math.max(0, decisionEnd) : replay.frames.length - 1); }}><Icon name={revealed ? 'lock' : 'search'} size={14}/>{revealed ? 'Masquer le résultat' : 'Révéler le résultat'}</button></div></div>
    <div className={`replay-table-wrap ${ordered.length > 6 ? 'large-table' : ''}`}>
      <div className="replay-felt"><span className="table-watermark">RANGE / REVIEW</span><div className="replay-board"><HandCards cards={board}/>{board.length === 0 && <span className="board-empty">{frame.street === 'Installation' || frame.street === 'Préflop' ? 'En attente du flop' : 'Pas de board'}</span>}<div className="replay-pot"><span>{frame.result ? 'Pot restant' : 'Pot total'}</span><strong>{format(frame.pot)}</strong><small>{frame.result ? 'Après versement des gains' : 'Mises incluses · avant rake'}</small></div></div></div>
      {ordered.map((player, index) => {
        const angle = Math.PI / 2 + index * 2 * Math.PI / Math.max(2, ordered.length);
        const isHero = player.name === hand.hero;
        const cards = isHero && !player.cards.length ? ['?', '?'] : player.cards;
        return <div key={player.seat} className={`replay-seat ${isHero ? 'is-hero' : ''} ${frame.actor === player.name ? 'is-acting' : ''} ${player.folded ? 'has-folded' : ''}`} style={{ left: `${50 + 39 * Math.cos(angle)}%`, top: `${50 + 35 * Math.sin(angle)}%` }}>
          <div className="seat-cards"><HandCards cards={cards} hidden={!isHero && !cards.length}/></div>
          <div className="seat-body"><div className="seat-position">{player.position}{isHero && <span>HERO</span>}</div><strong className="seat-name" title={player.name}>{player.name}</strong><span className="seat-stack">{format(player.stack)}</span><span className="seat-action">{player.folded ? 'Fold' : player.stack === 0 ? 'All-in' : player.lastAction || 'En attente'}</span></div>
        </div>;
      })}
      {ordered.map((player, index) => {
        if (player.committed <= 0) return null;
        const angle = Math.PI / 2 + index * 2 * Math.PI / Math.max(2, ordered.length);
        return <div key={`chips-${player.seat}`} className={`replay-bet ${frame.actor === player.name ? 'is-current-bet' : ''}`} style={{ left: `${50 + 27 * Math.cos(angle)}%`, top: `${50 + 17 * Math.sin(angle)}%` }} aria-label={`${player.name} a engagé ${format(player.committed)} sur cette rue`}>
          <span className="replay-chip-stack" aria-hidden="true"><i/><i/><i/></span><span>{format(player.committed)}</span>
        </div>;
      })}
    </div>
    <div className="replay-bottom">
      <div className="replay-current" aria-live="polite"><span className="replay-step-number">{activeStep + 1}</span><p>{frame.label}</p><button onClick={() => setLogOpen(true)} aria-label="Voir les actions déjà parcourues"><Icon name="menu" size={17}/></button></div>
      <div className="replay-transport"><div className="replay-controls"><button aria-label="Revenir au début de la main" disabled={activeStep === 0} onClick={() => setStep(0)}>↶</button><button aria-label="Action précédente" disabled={activeStep === 0} onClick={() => setStep(activeStep - 1)}><Icon name="chevron" className="rotate-180" size={17}/></button><span>{activeStep + 1} / {last + 1}</span><button aria-label="Action suivante" disabled={activeStep === last} onClick={() => setStep(activeStep + 1)}><Icon name="chevron" size={17}/></button></div><div className="replay-timeline"><input aria-label="Étape du replayer" type="range" min={0} max={last} value={activeStep} onChange={event => setStep(Number(event.target.value))}/><div className="replay-streets">{streetSteps.map(({ item, index }) => <button key={index} className={frame.street === item.street ? 'active' : ''} onClick={() => setStep(index)}>{item.street === 'Installation' ? 'Début' : item.street}</button>)}</div></div></div>
      <p className="replay-boundary">{!revealed && activeStep === last ? 'Note ta conclusion avant de révéler le résultat.' : revealed && firstResult < 0 ? 'Aucun résultat disponible dans cet historique.' : '← → Parcourir les actions · Les cartes adverses restent masquées avant le résultat.'}</p>
    </div>
    <Modal open={warningsOpen} onClose={closeWarnings}><ModalTitle>Points à vérifier</ModalTitle><div className="replay-warning">{replay.warnings.map(warning => <p key={warning}>{warning}</p>)}</div><Button onClick={closeWarnings} className="mt-4">Fermer</Button></Modal>
    <Modal open={logOpen} onClose={closeLog} className="max-w-[580px]"><ModalTitle>Actions déjà parcourues</ModalTitle><ol className="replay-action-log">{replay.frames.slice(0, activeStep + 1).map((item, index) => <li key={index}><button onClick={() => { setStep(index); closeLog(); }}><span>{index + 1}</span>{item.label}</button></li>)}</ol><Button onClick={closeLog} className="mt-4">Fermer</Button></Modal>
  </section>;
}
