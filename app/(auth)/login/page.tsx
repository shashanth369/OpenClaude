'use client';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const next = searchParams.get('next');
    if (next) setNotice(null);
  }, [searchParams]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const supabase = createClient();
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const next = searchParams.get('next') || '/chat';
        router.push(next);
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: name || email.split('@')[0] } },
        });
        if (error) throw error;
        // auto-confirm is enabled on the project, so we can sign in right away
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          setNotice('Account created — check your inbox to confirm, then sign in.');
          setMode('signin');
        } else {
          router.push('/chat');
          router.refresh();
        }
      }
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card">
      <div className="auth-logo">
        <svg width="52" height="52" viewBox="0 0 100 100" aria-hidden>
          <rect width="100" height="100" rx="22" fill="#c96442" />
          <g stroke="#fff" strokeWidth="7.5" strokeLinecap="round">
            <line x1="50" y1="14" x2="50" y2="86" />
            <line x1="19" y1="32" x2="81" y2="68" />
            <line x1="19" y1="68" x2="81" y2="32" />
            <line x1="14" y1="50" x2="86" y2="50" />
          </g>
        </svg>
        <div style={{ textAlign: 'center' }}>
          <div className="serif" style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>
            Open<span style={{ color: 'var(--accent)' }}>Claude</span>
          </div>
          <div style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 2 }}>
            One Claude experience · every free model
          </div>
        </div>
      </div>

      {!supabaseConfigured && (
        <div className="auth-error">
          Supabase env vars are missing. Set NEXT_PUBLIC_SUPABASE_URL and
          NEXT_PUBLIC_SUPABASE_ANON_KEY, then redeploy.
        </div>
      )}
      {error && <div className="auth-error">{error}</div>}
      {notice && <div className="auth-ok">{notice}</div>}

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {mode === 'signup' && (
          <input
            className="input"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        )}
        <input
          className="input"
          type="email"
          placeholder="you@example.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <input
          className="input"
          type="password"
          placeholder="Password (min 6 chars)"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        />
        <button className="btn btn-primary" type="submit" disabled={busy} style={{ justifyContent: 'center', padding: 12 }}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <div className="auth-toggle">
        {mode === 'signin' ? (
          <>
            New to OpenClaude?{' '}
            <button onClick={() => setMode('signup')}>Create an account</button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button onClick={() => setMode('signin')}>Sign in</button>
          </>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center' }}>
        Free forever. Powered by OpenRouter · Gemini · Groq · Airforce free tiers.
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <div className="auth-wrap">
        <LoginForm />
      </div>
    </Suspense>
  );
}
