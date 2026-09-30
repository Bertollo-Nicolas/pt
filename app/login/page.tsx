'use client';
export const dynamic = 'force-dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router   = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Lazy import so Supabase client never runs at SSR/build time
    const { createClient } = await import('@/lib/supabase');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) { setError(error.message); setLoading(false); return; }
    router.push('/');
    router.refresh();
  };

  return (
    <div className="login-layout"><aside className="login-story"><div className="brand"><span className="brand-symbol">r<span>↗</span></span><div>range<span className="brand-caption">TRAINER / PREFLOP</span></div></div><div className="login-manifesto"><span className="eyebrow">LE TRAVAIL HORS DES TABLES</span><h1>Moins d’hésitation.<br/>Plus de <em>maîtrise.</em></h1><p>Un espace pensé pour comprendre tes ranges, entraîner tes réflexes et faire progresser ton jeu.</p><div className="login-steps"><span>01 / Apprendre</span><span>02 / Pratiquer</span><span>03 / Progresser</span></div></div><div className="login-signature">CHAQUE DÉCISION COMPTE.<span>♠</span></div></aside><main className="login-main">
      <div className="w-full max-w-[380px]">
        {/* Logo */}
        <div className="mb-9">
          <div className="eyebrow mb-3">TON ESPACE PERSONNEL</div><h2 className="text-3xl font-medium tracking-tight">Content de te revoir.</h2>
          <p className="text-sm text-muted mt-3">Connecte-toi et reprends ta progression.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label htmlFor="login-email" className="text-[11px] font-bold uppercase tracking-widest text-muted block mb-1.5">
              Email
            </label>
            <input
              type="email" required
              id="login-email"
              autoComplete="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="ton@email.com"
              className="w-full min-h-11 bg-bg2 border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-muted focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="text-[11px] font-bold uppercase tracking-widest text-muted block mb-1.5">
              Mot de passe
            </label>
            <input
              type="password" required
              id="login-password"
              autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full min-h-11 bg-bg2 border border-border rounded-lg px-3 py-2.5 text-sm text-text placeholder-muted focus:border-accent transition-colors"
            />
          </div>

          {error && (
            <div className="text-[11px] text-red bg-red/10 border border-red/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full min-h-11 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 cursor-pointer mt-1"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p className="text-center text-xs text-muted mt-7 leading-relaxed">
          Pas de compte ? Contacte l&apos;admin pour en créer un.
        </p>
      </div>
    </main></div>
  );
}
