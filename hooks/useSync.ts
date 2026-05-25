'use client';
import { useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '@/store/appStore';
import { createClient } from '@/lib/supabase';

const DEBOUNCE_MS = 3000;

export function useSync() {
  const store     = useAppStore();
  const supabase  = createClient();
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  // ── Load from DB on mount ──────────────────────────────────
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const res = await fetch('/api/sync');
      if (!res.ok) return;
      const data = await res.json();

      // Hydrate store with DB data (DB wins over localStorage)
      if (data.srs)      useAppStore.setState({ srs: data.srs });
      if (data.config)   useAppStore.setState({ config: data.config });
      if (data.sessions) useAppStore.setState({ sessions: data.sessions });
      if (data.errors)   useAppStore.setState({ errors: data.errors });
      if (data.heatmap)  useAppStore.setState({ heatmap: data.heatmap });
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Debounced save to DB on state change ───────────────────
  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const s = useAppStore.getState();
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          srs:      s.srs,
          config:   s.config,
          sessions: s.sessions,
          errors:   s.errors,
          heatmap:  s.heatmap,
        }),
      });
    }, DEBOUNCE_MS);
  }, []);

  // Subscribe to relevant store changes
  useEffect(() => {
    const unsub = useAppStore.subscribe(
      (state, prev) => {
        const changed =
          state.srs      !== prev.srs      ||
          state.config   !== prev.config   ||
          state.sessions !== prev.sessions ||
          state.errors   !== prev.errors   ||
          state.heatmap  !== prev.heatmap;
        if (changed) scheduleSave();
      },
    );
    return () => { unsub(); if (timerRef.current) clearTimeout(timerRef.current); };
  }, [scheduleSave]);

  // ── Expose user + logout ───────────────────────────────────
  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }, [supabase]);

  return { logout };
}
