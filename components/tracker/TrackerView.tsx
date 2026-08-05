'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAppStore, getCfg } from '@/store/appStore';
import { parseWinamaxHH } from '@/lib/parser/winamax';
import { upsertPreflopStats, loadPreflopStats } from '@/lib/db';
import { createClient } from '@/lib/supabase';
import { buildRangeMap } from '@/lib/poker';
import { aggregateStats, buildTrackerReport, commonTrackerSpots, type TrackerDeviation } from '@/lib/tracker-analysis';
import { suggestTrackerMappings } from '@/lib/tracker-mapping';
import type { Category, PreflopStat, RmData } from '@/lib/types';

interface RangeOption {
  key: string;
  label: string;
  catId: string;
  tabId: string;
}

export function TrackerView() {
  const store = useAppStore();
  const cfg = getCfg(store);
  const { rmData, rangeColors, saveConfig, trackerSessions, addTrackerSession } = store;
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [stats, setStats] = useState<PreflopStat[]>([]);
  const [reportMode, setReportMode] = useState<'session' | 'global'>('session');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const supabase = createClient();

  const refreshStats = useCallback(async () => {
    const data = await loadPreflopStats(supabase);
    setStats(data);
  }, [supabase]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (!cfg.trackerHeroName) {
      alert("Veuillez d'abord configurer votre pseudo dans les paramètres.");
      return;
    }

    setImporting(true);
    setStatus(`Lecture de ${files.length} fichier(s)...`);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté");

      let totalParsed = 0;
      const sessionStats: PreflopStat[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatus(`Importation de ${file.name} (${i + 1}/${files.length})...`);
        const content = await file.text();
        const parsed = parseWinamaxHH(content, cfg.trackerHeroName);
        if (parsed.length > 0) {
          await upsertPreflopStats(supabase, user.id, parsed);
          sessionStats.push(...parsed);
          totalParsed += parsed.length;
        }
      }
      if (sessionStats.length > 0) {
        const importedAt = new Date().toISOString();
        const session = {
          id: `tracker_${importedAt}`,
          name: `Session ${new Date(importedAt).toLocaleString('fr-FR')}`,
          importedAt,
          fileCount: files.length,
          handCount: totalParsed,
          stats: aggregateStats(sessionStats),
        };
        addTrackerSession(session);
        setSelectedSessionId(session.id);
        setReportMode('session');
      }
      setStatus(`Importation terminée : ${totalParsed} mains analysées.`);
      refreshStats();
    } catch (err) {
      console.error(err);
      setStatus("Erreur lors de l'importation.");
    } finally {
      setImporting(false);
    }
  }, [cfg.trackerHeroName, supabase, refreshStats, addTrackerSession]);

  const totalHands = stats.reduce((acc, s) => acc + s.count, 0);
  const totalNet = stats.reduce((acc, s) => acc + s.net_bb, 0);
  const mappings = useMemo(() => cfg.trackerMappings ?? {}, [cfg.trackerMappings]);

  const rangeOptions = useMemo(() => buildRangeOptions(rmData), [rmData]);
  const rangeMaps = useMemo(() => {
    const result: Record<string, ReturnType<typeof buildRangeMap>> = {};
    if (!rmData) return result;
    for (const opt of rangeOptions) {
      const tab = rmData.categories[opt.catId]?.tabs?.[opt.tabId];
      if (tab) result[opt.key] = buildRangeMap(tab.rangeList, rangeColors);
    }
    return result;
  }, [rmData, rangeColors, rangeOptions]);

  const spotKeys = useMemo(() => {
    const keys = [...new Set([...commonTrackerSpots(), ...stats.flatMap(s => [s.spot, s.position]).filter(Boolean)])];
    return keys.sort((a, b) => a.localeCompare(b));
  }, [stats]);

  const mappingSuggestions = useMemo(
    () => suggestTrackerMappings(spotKeys, rangeOptions),
    [spotKeys, rangeOptions],
  );
  const suggestionBySpot = useMemo(
    () => new Map(mappingSuggestions.map(suggestion => [suggestion.spot, suggestion])),
    [mappingSuggestions],
  );
  const pendingSuggestions = useMemo(
    () => mappingSuggestions.filter(suggestion => !mappings[suggestion.spot]),
    [mappingSuggestions, mappings],
  );

  const selectedSession = trackerSessions.find(s => s.id === selectedSessionId) ?? trackerSessions[trackerSessions.length - 1] ?? null;
  const reportStats = reportMode === 'session' && selectedSession ? selectedSession.stats : stats;
  const report = useMemo(() => buildTrackerReport(reportStats, mappings, rangeMaps), [reportStats, mappings, rangeMaps]);

  const mappedHands = report.mappedHands;
  const deviationHands = report.deviationHands;

  const updateMapping = (key: string, value: string) => {
    const next = { ...mappings };
    if (value) next[key] = value;
    else delete next[key];
    saveConfig({ trackerMappings: next });
  };

  const applyMappingSuggestions = () => {
    if (pendingSuggestions.length === 0) return;
    const next = { ...mappings };
    for (const suggestion of pendingSuggestions) {
      if (!next[suggestion.spot]) next[suggestion.spot] = suggestion.rangeKey;
    }
    saveConfig({ trackerMappings: next });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto overflow-y-auto">
      <div className="bg-bg2 border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-2">📊 Poker Tracker (Winamax)</h2>
        <p className="text-muted text-sm mb-6">
          Mappez vos spots 5-max vers vos ranges, importez une session, puis consultez les écarts de la session et le global.
        </p>

        {!cfg.trackerHeroName ? (
          <div className="bg-orange/10 border border-orange/30 p-4 rounded-lg text-orange text-sm mb-6">
            ⚠️ Vous devez configurer votre <strong>Pseudo Winamax</strong> dans les paramètres pour commencer.
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-10 hover:border-accent/50 hover:bg-accent/5 transition-all cursor-pointer relative">
              <input
                type="file"
                multiple
                accept=".txt"
                onChange={handleFileUpload}
                disabled={importing}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="text-4xl mb-3">📁</div>
              <div className="text-sm font-semibold">Importer les mains de votre session</div>
              <div className="text-xs text-muted mt-1">Un import = une session analysable, en plus des stats globales</div>
            </div>

            {status && (
              <div className="text-center text-xs font-mono bg-bg3 p-3 rounded border border-border">
                {importing && <span className="inline-block animate-pulse mr-2">⏳</span>}
                {status}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Mains Total</h3>
          <div className="text-2xl font-bold">{totalHands}</div>
        </div>
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Net (BB)</h3>
          <div className={`text-2xl font-bold ${totalNet >= 0 ? 'text-green' : 'text-red'}`}>
            {totalNet > 0 ? '+' : ''}{totalNet.toFixed(1)}
          </div>
        </div>
        <div className="bg-bg2 border border-border rounded-xl p-5">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Winrate</h3>
          <div className="text-2xl font-bold">
            {totalHands > 0 ? ((totalNet / totalHands) * 100).toFixed(1) : 0} <span className="text-xs text-muted font-normal">bb/100</span>
          </div>
        </div>
      </div>

      {rangeOptions.length > 0 && (
        <div className="mt-8 bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider">Mapping en amont</h3>
                <p className="text-[11px] text-muted mt-1">Les pré-liens utilisent la position, l&apos;adversaire, la famille du spot et le sizing.</p>
              </div>
              {pendingSuggestions.length > 0 && (
                <button
                  onClick={applyMappingSuggestions}
                  className="flex-shrink-0 px-3 py-1.5 text-[11px] font-semibold rounded border bg-accent border-accent text-white hover:opacity-90 transition-opacity"
                >
                  Pré-lier {pendingSuggestions.length} spots
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-border max-h-[360px] overflow-y-auto">
            {spotKeys.map(key => (
              <div key={key} className="px-5 py-3 flex items-center gap-3">
                <div className="w-44 flex-shrink-0">
                  <div className="text-xs font-bold">{key}</div>
                  <div className="text-[9px] text-muted uppercase flex items-center gap-1.5">
                    <span>{key.includes(' ') ? 'spot' : 'position'}</span>
                    {!mappings[key] && suggestionBySpot.has(key) && (
                      <span className="text-green normal-case">pré-lien trouvé</span>
                    )}
                  </div>
                </div>
                <select
                  value={mappings[key] ?? ''}
                  onChange={e => updateMapping(key, e.target.value)}
                  className="flex-1 min-w-0 bg-bg3 border border-border rounded px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
                >
                  <option value="">Non mappé</option>
                  {rangeOptions.map(opt => (
                    <option key={opt.key} value={opt.key}>{opt.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {trackerSessions.length > 0 && (
        <div className="mt-8 bg-bg2 border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setReportMode('session')}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded border ${reportMode === 'session' ? 'bg-accent border-accent text-white' : 'border-border text-muted hover:text-text'}`}
            >
              Session
            </button>
            <button
              onClick={() => setReportMode('global')}
              className={`px-3 py-1.5 text-[11px] font-semibold rounded border ${reportMode === 'global' ? 'bg-accent border-accent text-white' : 'border-border text-muted hover:text-text'}`}
            >
              Global
            </button>
            {reportMode === 'session' && (
              <select
                value={selectedSession?.id ?? ''}
                onChange={e => setSelectedSessionId(e.target.value)}
                className="ml-auto max-w-[280px] bg-bg3 border border-border rounded px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
              >
                {trackerSessions.slice().reverse().map(s => (
                  <option key={s.id} value={s.id}>{s.name} · {s.handCount} mains</option>
                ))}
              </select>
            )}
          </div>
          <div className="text-[11px] text-muted">
            {reportMode === 'session' && selectedSession
              ? `${selectedSession.fileCount} fichier(s), ${selectedSession.handCount} main(s) importées`
              : `${totalHands} main(s) agrégées au global`}
          </div>
        </div>
      )}

      {mappedHands > 0 && (
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-bg2 border border-border rounded-xl p-5">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Mains mappées</h3>
            <div className="text-2xl font-bold">{mappedHands}</div>
          </div>
          <div className="bg-bg2 border border-border rounded-xl p-5">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1">Déviations détectées</h3>
            <div className={`text-2xl font-bold ${deviationHands > 0 ? 'text-orange' : 'text-green'}`}>{deviationHands}</div>
          </div>
        </div>
      )}

      {report.missing.length > 0 && (
        <div className="mt-8 bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold uppercase tracking-wider">Missing combos</h3>
            <p className="text-[11px] text-muted mt-1">Mains foldées alors que la range attend une action.</p>
          </div>
          <DeviationTable deviations={report.missing.slice(0, 40)} />
        </div>
      )}

      {report.extra.length > 0 && (
        <div className="mt-8 bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold uppercase tracking-wider">Combos hors range</h3>
            <p className="text-[11px] text-muted mt-1">Mains jouées alors que la range attend Fold.</p>
          </div>
          <DeviationTable deviations={report.extra.slice(0, 40)} />
        </div>
      )}

      {report.deviations.filter(d => d.type === 'different').length > 0 && (
        <div className="mt-8 bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold uppercase tracking-wider">Actions différentes</h3>
          </div>
          <DeviationTable deviations={report.deviations.filter(d => d.type === 'different').slice(0, 40)} />
        </div>
      )}

      {stats.length > 0 && (
        <div className="mt-8 bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold uppercase tracking-wider">Résumé par Position</h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-bg3/50 text-muted uppercase tracking-widest text-[9px]">
                <th className="px-5 py-3 font-bold">Pos</th>
                <th className="px-5 py-3 font-bold text-center">Mains</th>
                <th className="px-5 py-3 font-bold text-center">VPIP%</th>
                <th className="px-5 py-3 font-bold text-right">Net BB</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {['HJ', 'CO', 'BTN', 'SB', 'BB'].map(pos => {
                const posStats = stats.filter(s => s.position === pos);
                const count = posStats.reduce((acc, s) => acc + s.count, 0);
                if (count === 0) return null;
                const vpipCount = posStats.filter(s => s.action !== 'Fold' && s.action !== 'Check').reduce((acc, s) => acc + s.count, 0);
                const net = posStats.reduce((acc, s) => acc + s.net_bb, 0);
                return (
                  <tr key={pos} className="hover:bg-bg3/30 transition-colors">
                    <td className="px-5 py-3 font-bold">{pos}</td>
                    <td className="px-5 py-3 text-center">{count}</td>
                    <td className="px-5 py-3 text-center">{(vpipCount / count * 100).toFixed(1)}%</td>
                    <td className={`px-5 py-3 text-right font-mono ${net >= 0 ? 'text-green' : 'text-red'}`}>
                      {net > 0 ? '+' : ''}{net.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeviationTable({ deviations }: { deviations: TrackerDeviation[] }) {
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="bg-bg3/50 text-muted uppercase tracking-widest text-[9px]">
          <th className="px-5 py-3 font-bold">Spot</th>
          <th className="px-5 py-3 font-bold">Main</th>
          <th className="px-5 py-3 font-bold">Joué</th>
          <th className="px-5 py-3 font-bold">Range</th>
          <th className="px-5 py-3 font-bold text-center">Nb</th>
          <th className="px-5 py-3 font-bold text-right">Net BB</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {deviations.map(d => (
          <tr key={d.key} className="hover:bg-bg3/30 transition-colors">
            <td className="px-5 py-3 text-muted">{d.spot}</td>
            <td className="px-5 py-3 font-bold">{d.hand}</td>
            <td className="px-5 py-3">{d.action}</td>
            <td className="px-5 py-3">{d.expected}</td>
            <td className="px-5 py-3 text-center">{d.count}</td>
            <td className={`px-5 py-3 text-right font-mono ${d.net_bb >= 0 ? 'text-green' : 'text-red'}`}>
              {d.net_bb > 0 ? '+' : ''}{d.net_bb.toFixed(1)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function buildRangeOptions(rmData: RmData | null): RangeOption[] {
  if (!rmData) return [];
  const result: RangeOption[] = [];
  const visit = (id: string, path: string[]) => {
    const cat: Category | undefined = rmData.categories[id];
    if (!cat) return;
    const nextPath = cat.name === 'root' ? path : [...path, cat.name];
    if (cat.children) {
      for (const child of cat.children) visit(child, nextPath);
    }
    if (cat.tabList && cat.tabs) {
      for (const tabId of cat.tabList) {
        const tab = cat.tabs[tabId];
        if (!tab) continue;
        result.push({ key: `${id}__${tabId}`, catId: id, tabId, label: [...nextPath, tab.name].join(' / ') });
      }
    }
  };
  visit('root', []);
  return result;
}
