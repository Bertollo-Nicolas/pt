'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/appStore';
import { CbetDrillView } from './CbetDrillView';
import { MathDrillView } from './MathDrillView';
import { ValueDrillView } from './ValueDrillView';
import { Icon } from '../ui/Icon';

type DrillPage = 'catalog' | 'cbet' | 'math' | 'value';
const TABS: { id: DrillPage; label: string }[] = [{ id: 'catalog', label: 'Tous les drills' }, { id: 'cbet', label: 'C-bet théorie' }, { id: 'math', label: 'Maths' }, { id: 'value', label: 'Value vs passif' }];

export function DrillView() {
  const [page, setPage] = useState<DrillPage>('catalog');
  const cbet = useAppStore(state => state.config.cbetDrill);
  const math = useAppStore(state => state.config.mathDrill);
  const value = useAppStore(state => state.config.valueDrill);
  const progressLabel = (stats?: { attempts: number; correct: number }) => stats?.attempts ? `${stats.attempts} réponses · ${Math.round(stats.correct / stats.attempts * 100)} % de précision` : 'Prêt pour ta première session';
  return <div className="drill-root">
    <div role="tablist" aria-label="Drills" className="drill-tabs">{TABS.map(tab => <button key={tab.id} id={`drill-tab-${tab.id}`} role="tab" aria-selected={page === tab.id} aria-controls="drill-panel" tabIndex={page === tab.id ? 0 : -1} onClick={() => setPage(tab.id)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = TABS.findIndex(item => item.id === page);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
      setPage(TABS[next].id); document.getElementById(`drill-tab-${TABS[next].id}`)?.focus();
    }}>{tab.label}</button>)}</div>
    <div id="drill-panel" role="tabpanel" aria-labelledby={`drill-tab-${page}`} className="drill-content">
      {page === 'cbet' ? <CbetDrillView/> : page === 'math' ? <MathDrillView/> : page === 'value' ? <ValueDrillView/> : <div className="cbet-scroll drill-catalog"><div className="cbet-workspace">
        <header className="cbet-heading"><div><span className="eyebrow text-signal">ENTRAÎNEMENT / LES DRILLS</span><h1>Une compétence. Un exercice.</h1><p>Choisis ce que tu veux travailler, puis construis tes réflexes.</p></div></header>
        <div className="drill-catalog-grid">
          <button className="drill-catalog-card" onClick={() => setPage('value')}><span className="drill-catalog-icon"><Icon name="target" size={24}/></span><span className="section-label">VALUE / EXPLOIT</span><h2>Value vs fish passif</h2><p className="text-signal">Hero IP · Flop → Turn → River</p><p>Identifie ta main et choisis le sizing à chaque street, selon les lignes de ton cours.</p><div className="drill-catalog-tags"><span>6 textures</span><span>Adaptations</span><span>Street par street</span></div><small>{progressLabel(value)}</small><strong>Travailler mes lignes →</strong></button>
          <button className="drill-catalog-card" onClick={() => setPage('cbet')}><span className="drill-catalog-icon"><Icon name="target" size={24}/></span><span className="section-label">THÉORIE POSTFLOP</span><h2>C-bet théorie</h2><p className="text-signal">IP BU vs BB</p><p>Observe le flop, identifie la texture et choisis le sizing de ta stratégie.</p><div className="drill-catalog-tags"><span>64 flops</span><span>Durée au choix</span><span>Répétition adaptative</span></div><small>{progressLabel(cbet)}</small><strong>Ouvrir ce drill →</strong></button>
          <button className="drill-catalog-card" onClick={() => setPage('math')}><span className="drill-catalog-icon"><Icon name="chart" size={24}/></span><span className="section-label">FONDAMENTAUX</span><h2>Maths du poker</h2><p className="text-signal">Cotes · Outs · Bluffs · Ratios</p><p>Calcule de tête, vérifie ton raisonnement et consolide tes repères.</p><div className="drill-catalog-tags"><span>5 thèmes</span><span>Mode mixte</span><span>Fiches mémo</span></div><small>{progressLabel(math)}</small><strong>Ouvrir les maths →</strong></button>
        </div><p className="cbet-footnote">Chaque drill conserve sa progression. Changer d’onglet interrompt la session en cours.</p>
      </div></div>}
    </div>
  </div>;
}
