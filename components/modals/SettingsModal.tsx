'use client';
import { useState, useEffect } from 'react';
import { useAppStore, getCfg } from '@/store/appStore';
import { Modal, ModalTitle, ModalActions } from '../ui/Modal';

const FOLD_DEFAULT = '#6b7280';

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useAppStore();
  const { saveConfig, saveColorOverride, rmData, colorOverrides } = store;
  const cfg = getCfg(store);

  const [threshold, setThreshold] = useState(cfg.threshold);
  const [minHands, setMinHands] = useState(cfg.minHands);
  const [grilleThreshold, setGrilleThreshold] = useState(cfg.grilleThreshold);
  const [intervals, setIntervals] = useState(cfg.intervals.join(', '));
  const [trackerHeroName, setTrackerHeroName] = useState(cfg.trackerHeroName || '');

  // Sync with store values when modal opens
  useEffect(() => {
    if (open) {
      setThreshold(cfg.threshold);
      setMinHands(cfg.minHands);
      setGrilleThreshold(cfg.grilleThreshold);
      setIntervals(cfg.intervals.join(', '));
      setTrackerHeroName(cfg.trackerHeroName || '');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    const parsed = intervals.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0);
    if (parsed.length === 0) return;
    saveConfig({ threshold, minHands, grilleThreshold, intervals: parsed, trackerHeroName });
    onClose();
  };

  const handleReset = () => {
    useAppStore.setState({ config: {} });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} className="!max-w-[400px]">
      <ModalTitle>⚙️ Paramètres</ModalTitle>

      <div className="mt-4 space-y-4">
        {/* Flash accuracy threshold */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted block mb-1.5">
            Seuil précision Flash (%)
          </label>
          <p className="text-[10px] text-muted mb-1.5">Précision minimale pour proposer l&apos;ajout au SRS depuis Flash.</p>
          <input
            type="number" min="50" max="100"
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-24 bg-bg3 border border-border rounded px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
          />
        </div>

        {/* Min hands */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted block mb-1.5">
            Mains min. avant proposition SRS
          </label>
          <p className="text-[10px] text-muted mb-1.5">Nombre de mains Flash minimum avant de proposer le SRS.</p>
          <input
            type="number" min="5" max="100"
            value={minHands}
            onChange={e => setMinHands(Number(e.target.value))}
            className="w-24 bg-bg3 border border-border rounded px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
          />
        </div>

        {/* Grille threshold */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted block mb-1.5">
            Seuil score Grille (%)
          </label>
          <p className="text-[10px] text-muted mb-1.5">Score minimum en Grille pour valider une révision SRS.</p>
          <input
            type="number" min="50" max="100"
            value={grilleThreshold}
            onChange={e => setGrilleThreshold(Number(e.target.value))}
            className="w-24 bg-bg3 border border-border rounded px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
          />
        </div>

        {/* SRS intervals */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted block mb-1.5">
            Intervalles SRS (jours)
          </label>
          <p className="text-[10px] text-muted mb-1.5">Séquence de révisions, séparés par des virgules.</p>
          <input
            type="text"
            value={intervals}
            onChange={e => setIntervals(e.target.value)}
            placeholder="1, 3, 7, 14, 30, 90"
            className="w-full bg-bg3 border border-border rounded px-2.5 py-1.5 text-xs text-text placeholder-muted outline-none focus:border-accent"
          />
        </div>

        {/* Tracker Hero Name */}
        <div>
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted block mb-1.5">
            Pseudo Tracker (Winamax)
          </label>
          <p className="text-[10px] text-muted mb-1.5">Utilisé pour identifier vos mains dans les fichiers d&apos;historique.</p>
          <input
            type="text"
            value={trackerHeroName}
            onChange={e => setTrackerHeroName(e.target.value)}
            placeholder="Ex: Hero_Name"
            className="w-full bg-bg3 border border-border rounded px-2.5 py-1.5 text-xs text-text placeholder-muted outline-none focus:border-accent"
          />
        </div>

        {/* Action color overrides */}
        {(() => {
          const actionDefs: Array<{ name: string; defaultColor: string }> = rmData
            ? [...new Map(
                Object.values(rmData.ranges)
                  .filter(r => r.name && r.color && !r.name.toUpperCase().includes('FOLD'))
                  .map(r => [r.name, r.color] as [string, string])
              )].map(([name, color]) => ({ name, defaultColor: color }))
            : [];
          actionDefs.push({ name: 'Fold', defaultColor: FOLD_DEFAULT });
          if (actionDefs.length <= 1) return null;
          return (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted block mb-1.5">
                Couleurs des actions
              </label>
              <div className="space-y-2">
                {actionDefs.map(({ name, defaultColor }) => {
                  const current = colorOverrides?.[name] ?? defaultColor;
                  const isOverridden = colorOverrides?.[name] && colorOverrides[name] !== defaultColor;
                  return (
                    <div key={name} className="flex items-center gap-2.5">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: current }} />
                      <span className="text-xs text-text flex-1">{name}</span>
                      <input
                        type="color"
                        value={current}
                        onChange={e => saveColorOverride(name, e.target.value)}
                        className="w-7 h-7 rounded cursor-pointer border-0 p-0 bg-transparent"
                        title={`Couleur pour ${name}`}
                      />
                      {isOverridden && (
                        <button
                          onClick={() => saveColorOverride(name, defaultColor)}
                          className="text-[9px] text-muted hover:text-text cursor-pointer transition-colors"
                          title="Réinitialiser">
                          ↺
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>

      <div className="mt-5 flex justify-between items-center">
        <button
          onClick={handleReset}
          className="text-[11px] text-muted hover:text-red transition-colors cursor-pointer"
        >
          Réinitialiser les défauts
        </button>
        <ModalActions>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-xs font-semibold rounded border bg-accent border-accent text-white hover:opacity-90 transition-opacity cursor-pointer"
          >
            Enregistrer
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold rounded border border-border text-muted hover:text-text transition-colors cursor-pointer"
          >
            Annuler
          </button>
        </ModalActions>
      </div>
    </Modal>
  );
}
