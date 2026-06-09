'use client';
import { useState, useCallback, useEffect } from 'react';
import { useAppStore, getCfg } from '@/store/appStore';
import { parseWinamaxHH } from '@/lib/parser/winamax';
import { upsertPreflopStats, loadPreflopStats } from '@/lib/db';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '../ui/Button';
import type { PreflopStat } from '@/lib/types';

export function TrackerView() {
  const store = useAppStore();
  const cfg = getCfg(store);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [stats, setStats] = useState<PreflopStat[]>([]);
  const supabase = createClientComponentClient();

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
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatus(`Importation de ${file.name} (${i + 1}/${files.length})...`);
        const content = await file.text();
        const parsed = parseWinamaxHH(content, cfg.trackerHeroName);
        if (parsed.length > 0) {
          await upsertPreflopStats(supabase, user.id, parsed);
          totalParsed += parsed.length;
        }
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

  const totalHands = stats.reduce((acc, s) => acc + s.count, 0);
  const totalNet = stats.reduce((acc, s) => acc + s.net_bb, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto overflow-y-auto">
      <div className="bg-bg2 border border-border rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-bold mb-2">📊 Poker Tracker (Winamax)</h2>
        <p className="text-muted text-sm mb-6">
          Importez vos fichiers d&apos;historique de mains Winamax pour comparer votre jeu avec vos ranges.
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
              <div className="text-sm font-semibold">Sélectionnez vos fichiers .txt</div>
              <div className="text-xs text-muted mt-1">Généralement dans Documents/Winamax/Accounts/Pseudo/History</div>
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
              {['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'].map(pos => {
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

