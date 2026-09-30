'use client';
import { useAppStore } from '@/store/appStore';
import { Icon } from './ui/Icon';
export function ExerciseHeading({ mode }: { mode: 'flash' | 'grille' }) {
  const { selectedTab, setMode } = useAppStore();
  return <div className="exercise-heading"><div><div className="eyebrow">{mode === 'flash' ? 'PRATIQUER / FLASHCARDS' : 'VALIDER / RANGE BUILDER'}</div><h1>{selectedTab?.name}<span>{selectedTab?.catName}</span></h1></div><div className="exercise-switch" aria-label="Type d’exercice"><button aria-pressed={mode === 'flash'} onClick={() => setMode('flash')}><Icon name="flash" size={15}/><span>Décisions</span></button><button aria-pressed={mode === 'grille'} onClick={() => setMode('grille')}><Icon name="grid" size={15}/><span>Grille</span></button></div></div>;
}
