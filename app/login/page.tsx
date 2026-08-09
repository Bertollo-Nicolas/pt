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
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-[340px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-[26px] font-bold tracking-tight mb-1">
            Range <span className="text-accent">Trainer</span>
          </div>
          <p className="text-xs text-muted">Connecte-toi pour accéder à tes ranges</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-3">
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

        <p className="text-center text-xs text-muted mt-5">
          Pas de compte ? Contacte l&apos;admin pour en créer un.
        </p>
      </div>
    </div>
  );
}
