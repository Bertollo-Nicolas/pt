'use client';
import { useState, useCallback, useEffect, useMemo, type CSSProperties } from 'react';
import { useAppStore, getCfg } from '@/store/appStore';
import { parseWinamaxHH } from '@/lib/parser/winamax';
import { upsertPreflopStats, loadPreflopStats } from '@/lib/db';
import { createClient } from '@/lib/supabase';
import { allHands, buildRangeMap, getDecisionActions, isFoldAction } from '@/lib/poker';
import { buildTrackerRangeReports, commonTrackerSpots, type TrackerHandReport, type TrackerRangeReport } from '@/lib/tracker-analysis';
import { suggestTrackerMappings } from '@/lib/tracker-mapping';
import type { Category, PreflopStat, RmData } from '@/lib/types';
import { Icon } from '@/components/ui/Icon';
import { SectionHeading, Skeleton, StatCard, Surface } from '@/components/ui/Surface';

interface RangeOption {
  key: string;
  label: string;
  catId: string;
  tabId: string;
}

export function TrackerView() {
  const store = useAppStore();
  const cfg = getCfg(store);
  const { rmData, rangeColors, saveConfig } = store;
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [stats, setStats] = useState<PreflopStat[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [reportMode, setReportMode] = useState<'session' | 'global'>('session');
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedRangeKey, setSelectedRangeKey] = useState<string | null>(null);
  const [errorFilter, setErrorFilter] = useState<'all' | 'missed' | 'extra' | 'different'>('all');
  const [selectedHand, setSelectedHand] = useState<string | null>(null);
  const supabase = createClient();

  const refreshStats = useCallback(async () => {
    try {
      const data = await loadPreflopStats(supabase);
      setStats(data);
    } finally {
      setStatsLoading(false);
    }
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
        const newestDay = [...new Set(sessionStats.map(stat => stat.day))].sort().at(-1) ?? null;
        setSelectedDay(newestDay);
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
  }, [cfg.trackerHeroName, supabase, refreshStats]);

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
  const rangeLabels = useMemo(
    () => Object.fromEntries(rangeOptions.map(option => [option.key, option.label])),
    [rangeOptions],
  );

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

  const sessionDays = useMemo(() => [...new Set(stats.map(stat => stat.day))].sort().reverse(), [stats]);
  const activeDay = selectedDay ?? sessionDays[0] ?? null;
  const reportStats = useMemo(
    () => reportMode === 'session' && activeDay ? stats.filter(stat => stat.day === activeDay) : stats,
    [reportMode, activeDay, stats],
  );
  const rangeReports = useMemo(
    () => buildTrackerRangeReports(reportStats, mappings, rangeMaps, rangeLabels),
    [reportStats, mappings, rangeMaps, rangeLabels],
  );
  const totalHands = reportStats.reduce((acc, stat) => acc + stat.count, 0);
  const totalNet = reportStats.reduce((acc, stat) => acc + stat.net_bb, 0);
  const selectedRange = rangeReports.find(report => report.rangeKey === selectedRangeKey) ?? null;
  const mappedHands = rangeReports.reduce((sum, report) => sum + report.total, 0);
  const deviationHands = rangeReports.reduce((sum, report) => sum + report.errors, 0);
  const priorityReports = [...rangeReports].filter(report => report.errors > 0).sort((a, b) => b.errors - a.errors).slice(0, 3);

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
    <div className="flex-1 overflow-y-auto bg-gradient-to-b from-bg3/30 to-bg px-3 py-4 sm:p-6">
      <div className="max-w-6xl mx-auto pb-8">
      <Surface className="p-4 sm:p-6">
        <SectionHeading eyebrow="Analyse" title="Poker Tracker" description="Reliez vos spots Winamax à vos ranges, importez une session puis identifiez rapidement les écarts prioritaires." action={<div className="w-10 h-10 rounded-xl bg-accent/15 text-accent flex items-center justify-center"><Icon name="chart" size={20}/></div>} />

        {!cfg.trackerHeroName ? (
          <div className="bg-orange/10 border border-orange/30 p-4 rounded-lg text-orange text-sm mt-6">
            ⚠️ Vous devez configurer votre <strong>Pseudo Winamax</strong> dans les paramètres pour commencer.
          </div>
        ) : (
          <div className="space-y-4 mt-6">
            <div className="flex flex-col items-center justify-center border border-dashed border-border2 rounded-xl p-6 sm:p-8 hover:border-accent/60 hover:bg-accent/5 transition-all cursor-pointer relative">
              <input
                type="file"
                multiple
                accept=".txt"
                onChange={handleFileUpload}
                disabled={importing}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center mb-3"><Icon name="upload" size={22}/></div>
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
      </Surface>

      {statsLoading ? <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3" aria-label="Chargement des statistiques"><Skeleton className="h-32"/><Skeleton className="h-32"/><Skeleton className="h-32"/></div> : <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Mains analysées" value={totalHands} detail={reportMode === 'session' ? 'Session sélectionnée' : 'Toutes les sessions'} />
        <StatCard label="Résultat net" value={`${totalNet > 0 ? '+' : ''}${totalNet.toFixed(1)} BB`} tone={totalNet >= 0 ? 'positive' : 'negative'} />
        <StatCard label="Winrate" value={`${totalHands > 0 ? ((totalNet / totalHands) * 100).toFixed(1) : 0}`} detail="bb / 100 mains" tone={totalNet >= 0 ? 'positive' : 'negative'} />
      </div>}

      {sessionDays.length > 1 && <WinrateTrend stats={stats} days={[...sessionDays].reverse()} />}

      {rangeOptions.length > 0 && (
        <details className="mt-4 bg-bg2 border border-border rounded-xl overflow-hidden">
          <summary className="px-5 py-4 cursor-pointer select-none">
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
          </summary>
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
        </details>
      )}

      {sessionDays.length > 0 && (
        <div className="mt-4 bg-bg2/95 backdrop-blur border border-border rounded-xl p-4 sticky top-2 z-10 shadow-lg">
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
                value={activeDay ?? ''}
                onChange={e => { setSelectedDay(e.target.value); setSelectedRangeKey(null); }}
                className="ml-auto max-w-[280px] bg-bg3 border border-border rounded px-2.5 py-1.5 text-xs text-text outline-none focus:border-accent"
              >
                {sessionDays.map(day => (
                  <option key={day} value={day}>
                    {new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR')} · {stats.filter(stat => stat.day === day).reduce((sum, stat) => sum + stat.count, 0)} mains
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="text-[11px] text-muted">
            {reportMode === 'session' && activeDay
              ? `Session du ${new Date(`${activeDay}T12:00:00`).toLocaleDateString('fr-FR')} · ${reportStats.reduce((sum, stat) => sum + stat.count, 0)} main(s)`
              : `${totalHands} main(s) agrégées au global`}
          </div>
        </div>
      )}

      {mappedHands > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
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

      {priorityReports.length > 0 && (
        <section className="mt-4">
          <div className="section-label mb-2">Priorités de travail</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {priorityReports.map((report, index) => (
              <button key={report.rangeKey} onClick={() => { setSelectedRangeKey(report.rangeKey); setSelectedHand(null); setErrorFilter('all'); }} className="text-left bg-bg2 border border-border rounded-xl p-4 hover:border-accent/60 hover:bg-accent/5 transition-colors">
                <div className="flex items-center justify-between gap-3"><span className="text-[11px] font-bold text-accent">#{index + 1}</span><span className="text-xs font-bold text-orange">{report.errors} erreurs</span></div>
                <div className="text-sm font-semibold mt-2 line-clamp-2">{report.label}</div>
                <div className="text-[11px] text-muted mt-1">{report.total ? Math.round(report.errors / report.total * 100) : 0}% de déviation</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {rangeReports.length > 0 && (
        <div className="mt-4 bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold uppercase tracking-wider">Erreurs par range</h3>
            <p className="text-[11px] text-muted mt-1">Cliquez sur une range pour comparer visuellement votre jeu à la stratégie originale.</p>
          </div>
          <RangeReportTable reports={rangeReports} selectedKey={selectedRangeKey} onSelect={key => {
            setSelectedRangeKey(key);
            setSelectedHand(null);
            setErrorFilter('all');
          }} />
        </div>
      )}

      {selectedRange && rangeMaps[selectedRange.rangeKey] && (
        <RangeErrorDetail
          report={selectedRange}
          rangeMap={rangeMaps[selectedRange.rangeKey]}
          filter={errorFilter}
          onFilter={setErrorFilter}
          selectedHand={selectedHand}
          onSelectHand={setSelectedHand}
        />
      )}

      {reportStats.length > 0 && (
        <div className="mt-4 bg-bg2 border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-bold uppercase tracking-wider">Résumé par Position</h3>
          </div>
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-xs">
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
                const posStats = reportStats.filter(s => s.position === pos);
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
          </table></div>
        </div>
      )}
      </div>
    </div>
  );
}

function RangeReportTable({ reports, selectedKey, onSelect }: {
  reports: TrackerRangeReport[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <><div className="sm:hidden divide-y divide-border">
      {reports.map(report => (
        <button key={report.rangeKey} onClick={() => onSelect(report.rangeKey)} className={`w-full text-left p-4 transition-colors ${selectedKey === report.rangeKey ? 'bg-accent/10' : 'hover:bg-bg3/40'}`}>
          <div className="flex items-start justify-between gap-3"><div className="font-semibold text-sm line-clamp-2">{report.label}</div><span className="text-xs font-bold text-orange flex-shrink-0">{report.errors} erreurs</span></div>
          <div className="text-[11px] text-muted mt-1 truncate">{report.spots.join(' · ')}</div>
          <div className="grid grid-cols-4 gap-2 mt-3 text-center">
            <Metric label="Mains" value={report.total}/><Metric label="Taux" value={`${report.total ? Math.round(report.errors / report.total * 100) : 0}%`}/><Metric label="Manquées" value={report.missed}/><Metric label="Hors range" value={report.extra}/>
          </div>
        </button>
      ))}
    </div><div className="hidden sm:block overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
      <thead>
        <tr className="bg-bg3/50 text-muted uppercase tracking-widest text-[9px]">
          <th className="px-5 py-3 font-bold">Range</th>
          <th className="px-3 py-3 font-bold text-center">Mains</th>
          <th className="px-3 py-3 font-bold text-center">Erreurs</th>
          <th className="px-3 py-3 font-bold text-center">Taux</th>
          <th className="px-3 py-3 font-bold text-center">Manquées</th>
          <th className="px-3 py-3 font-bold text-center">Hors range</th>
          <th className="px-3 py-3 font-bold text-center">Action</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {reports.map(report => (
          <tr key={report.rangeKey} onClick={() => onSelect(report.rangeKey)}
            className={`cursor-pointer transition-colors ${selectedKey === report.rangeKey ? 'bg-accent/10' : 'hover:bg-bg3/30'}`}>
            <td className="px-5 py-3">
              <div className="font-bold">{report.label}</div>
              <div className="text-[9px] text-muted mt-0.5 truncate max-w-[360px]">{report.spots.join(' · ')}</div>
            </td>
            <td className="px-3 py-3 text-center">{report.total}</td>
            <td className="px-3 py-3 text-center font-bold text-orange">{report.errors}</td>
            <td className="px-3 py-3 text-center">{report.total ? Math.round(report.errors / report.total * 100) : 0}%</td>
            <td className="px-3 py-3 text-center text-red">{report.missed}</td>
            <td className="px-3 py-3 text-center text-orange">{report.extra}</td>
            <td className="px-3 py-3 text-center text-blue">{report.different}</td>
          </tr>
        ))}
      </tbody>
    </table></div></>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="bg-bg3 rounded-lg px-2 py-2"><div className="text-xs font-bold">{value}</div><div className="text-[9px] text-muted uppercase mt-0.5">{label}</div></div>;
}

function WinrateTrend({ stats, days }: { stats: PreflopStat[]; days: string[] }) {
  const points = days.map(day => {
    const rows = stats.filter(stat => stat.day === day);
    const hands = rows.reduce((sum, row) => sum + row.count, 0);
    const net = rows.reduce((sum, row) => sum + row.net_bb, 0);
    return { day, value: hands ? net / hands * 100 : 0 };
  });
  const min = Math.min(...points.map(point => point.value));
  const max = Math.max(...points.map(point => point.value));
  const span = Math.max(1, max - min);
  const polyline = points.map((point, index) => `${points.length === 1 ? 50 : index / (points.length - 1) * 100},${90 - (point.value - min) / span * 75}`).join(' ');
  return <Surface className="mt-4 p-4 sm:p-5"><div className="flex items-end justify-between gap-3 mb-3"><div><div className="section-label">Évolution</div><h3 className="text-sm font-semibold mt-1">Winrate par session</h3></div><div className="text-xs text-muted">{points.length} sessions</div></div><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-28 overflow-visible"><path d="M0 90H100" stroke="#2e2e38" strokeWidth="1"/><polyline points={polyline} fill="none" stroke="#6c63ff" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="flex justify-between text-[10px] text-muted mt-1"><span>{new Date(`${points[0].day}T12:00:00`).toLocaleDateString('fr-FR')}</span><span>{new Date(`${points[points.length - 1].day}T12:00:00`).toLocaleDateString('fr-FR')}</span></div></Surface>;
}

function RangeErrorDetail({ report, rangeMap, filter, onFilter, selectedHand, onSelectHand }: {
  report: TrackerRangeReport;
  rangeMap: ReturnType<typeof buildRangeMap>;
  filter: 'all' | 'missed' | 'extra' | 'different';
  onFilter: (filter: 'all' | 'missed' | 'extra' | 'different') => void;
  selectedHand: string | null;
  onSelectHand: (hand: string) => void;
}) {
  const handReport = selectedHand ? report.hands[selectedHand] : null;
  const filters: Array<{ key: typeof filter; label: string; count: number }> = [
    { key: 'all', label: 'Toutes', count: report.errors },
    { key: 'missed', label: 'Manquées', count: report.missed },
    { key: 'extra', label: 'Hors range', count: report.extra },
    { key: 'different', label: 'Mauvaise action', count: report.different },
  ];

  return (
    <div className="mt-4 bg-bg2 border border-border rounded-xl p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold">{report.label}</h3>
          <p className="text-[10px] text-muted mt-0.5">{report.total} décisions · {report.errors} erreurs · {report.spots.length} spot(s)</p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          {filters.map(item => (
            <button key={item.key} onClick={() => onFilter(item.key)}
              className={`px-2 py-1 rounded border text-[10px] ${filter === item.key ? 'bg-accent border-accent text-white' : 'border-border text-muted hover:text-text'}`}>
              {item.label} {item.count}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TrackerGrid title="Range originale" rangeMap={rangeMap} report={report} mode="original" filter={filter} selectedHand={selectedHand} onSelectHand={onSelectHand} />
        <TrackerGrid title="Votre jeu / erreurs" rangeMap={rangeMap} report={report} mode="errors" filter={filter} selectedHand={selectedHand} onSelectHand={onSelectHand} />
      </div>

      <div className="flex flex-wrap gap-3 text-[9px] text-muted mt-3">
        <Legend color="#e05555" label="Main manquée" />
        <Legend color="#e09540" label="Hors range" />
        <Legend color="#6c63ff" label="Mauvaise action" />
        <Legend color="#2ecc8a" label="Correct" />
        <Legend color="#3a3a46" label="Non observée" />
      </div>

      {handReport && <HandReportDetail report={handReport} />}
    </div>
  );
}

function TrackerGrid({ title, rangeMap, report, mode, filter, selectedHand, onSelectHand }: {
  title: string;
  rangeMap: ReturnType<typeof buildRangeMap>;
  report: TrackerRangeReport;
  mode: 'original' | 'errors';
  filter: 'all' | 'missed' | 'extra' | 'different';
  selectedHand: string | null;
  onSelectHand: (hand: string) => void;
}) {
  return (
    <div>
      <div className="text-[9px] text-muted uppercase tracking-wider mb-1.5 text-center">{title}</div>
      <div className="grid gap-px bg-bg3 p-1 rounded-lg" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
        {allHands().map(({ hand }) => {
          const observed = report.hands[hand];
          const visible = filter === 'all' || Boolean(observed?.[filter]);
          const style = mode === 'original' ? originalCellStyle(hand, rangeMap) : errorCellStyle(observed);
          return (
            <button key={hand} onClick={() => onSelectHand(hand)} title={hand}
              className={`aspect-square min-w-0 rounded-sm flex items-center justify-center font-bold text-[clamp(6px,1.4vw,9px)] border transition-all ${selectedHand === hand ? 'ring-2 ring-white z-10' : ''}`}
              style={{ ...style, opacity: mode === 'errors' && !visible ? 0.18 : 1 }}>
              {hand}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function originalCellStyle(hand: string, rangeMap: ReturnType<typeof buildRangeMap>): CSSProperties {
  const decisions = getDecisionActions(hand, rangeMap).filter(action => !isFoldAction(action.action));
  if (decisions.length === 0) return { background: '#25252d', borderColor: '#353540', color: '#777789' };
  if (decisions.length === 1) return { background: `${decisions[0].color}88`, borderColor: decisions[0].color, color: '#fff' };
  let position = 0;
  const total = decisions.reduce((sum, action) => sum + action.freq, 0);
  const stops: string[] = [];
  for (const action of decisions) {
    const end = position + action.freq / total * 100;
    stops.push(`${action.color}aa ${position}%`, `${action.color}aa ${end}%`);
    position = end;
  }
  return { background: `linear-gradient(90deg, ${stops.join(',')})`, borderColor: decisions[0].color, color: '#fff' };
}

function errorCellStyle(report?: TrackerHandReport): CSSProperties {
  if (!report) return { background: '#25252d', borderColor: '#353540', color: '#777789' };
  if (report.different > 0) return { background: '#6c63ff99', borderColor: '#6c63ff', color: '#fff' };
  if (report.extra > 0) return { background: '#e0954099', borderColor: '#e09540', color: '#fff' };
  if (report.missed > 0) return { background: '#e0555599', borderColor: '#e05555', color: '#fff' };
  return { background: '#2ecc8a66', borderColor: '#2ecc8a', color: '#fff' };
}

function HandReportDetail({ report }: { report: TrackerHandReport }) {
  return (
    <div className="mt-4 bg-bg3 border border-border rounded-lg p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-bold">{report.hand}</div>
        <div className="text-[10px] text-muted">{report.total} occurrence(s) · {report.errors} erreur(s) · {report.net_bb.toFixed(1)} BB</div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 text-[11px]">
        <div>
          <div className="text-[9px] uppercase tracking-wider text-muted mb-1">Range attendue</div>
          {report.expected.map(action => <div key={action.action}>{action.action} · {Math.round(action.freq * 100)}%</div>)}
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-wider text-muted mb-1">Actions observées</div>
          {Object.entries(report.actual).map(([action, count]) => <div key={action}>{action} · {count}</div>)}
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background: color }} />{label}</span>;
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
