'use client';
import { useMemo } from 'react';
import { getRangeGroups } from '@/lib/range-options';
import { useAppStore } from '@/store/appStore';

export function TrainingRangeSelect() {
  const { rmData, lastSpot, selectTab } = useAppStore();
  const groups = useMemo(() => getRangeGroups(rmData), [rmData]);
  const value = lastSpot ? JSON.stringify([lastSpot.catId, lastSpot.tabId]) : '';
  if (!groups.length) return null;
  return <select aria-label="Choisir une range dans tous les dossiers" className="bg-bg2 border border-border rounded-lg px-2 py-2 text-sm min-w-0 w-full max-w-[340px]" value={value} onChange={event => {
    const [catId, tabId] = JSON.parse(event.target.value) as [string, string];
    selectTab(catId, tabId);
  }}>
    <option value="" disabled>Choisir une range</option>
    {groups.map(group => <optgroup key={group.catId} label={group.path}>
      {group.tabs.map(tab => <option key={tab.id} value={JSON.stringify([group.catId, tab.id])}>{group.path} · {tab.name}</option>)}
    </optgroup>)}
  </select>;
}
