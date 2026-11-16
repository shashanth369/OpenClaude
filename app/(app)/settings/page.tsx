'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  KeyRound, User, Palette, Download, Trash2, Sun, Moon, Check, ExternalLink, LogOut, Sparkles,
} from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import { getClientKeys, setClientKeys, clearClientKeys } from '@/lib/clientKeys';
import { PROVIDERS, encodeModelChoice, decodeModelChoice } from '@/lib/providers';
import type { StoredKeyMap } from '@/lib/types';
import ModelPicker, { type ModelChoice } from '@/components/ModelPicker';

export default function SettingsPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [theme, setTheme] = useState('dark');
  const [keys, setKeys] = useState<StoredKeyMap>({});
  const [serverStatus, setServerStatus] = useState<Record<string, { configured: boolean; live: boolean }>>({});
  const [saved, setSaved] = useState(false);
  const [defaultChoice, setDefaultChoice] = useState<ModelChoice>(() => decodeModelChoice(
    typeof window !== 'undefined' ? localStorage.getItem('openclaude:default-model') : null
  ));
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || 'dark');
    setKeys(getClientKeys());
    if (supabaseConfigured) {
      createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ''));
    }
    fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: getClientKeys() }),
    })
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, { configured: boolean; live: boolean }> = {};
        (data?.providers ?? []).forEach((p: any) => {
          map[p.id] = { configured: p.configured, live: p.live };
        });
        setServerStatus(map);
      })
      .catch(() => {});
  }, []);

  const toggleTheme = () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('openclaude-theme', next);
    setTheme(next);
  };

  const saveKeys = () => {
    const cleaned: StoredKeyMap = {};
    (Object.keys(keys) as (keyof StoredKeyMap)[]).forEach((k) => {
      if (keys[k]?.trim()) cleaned[k] = keys[k]!.trim();
    });
    setClientKeys(cleaned);
    setSaved(true);
    setStatus('Keys saved to this browser. They are sent only with your own AI requests.');
    setTimeout(() => setSaved(false), 1600);
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const deleteAllData = async () => {
    if (!window.confirm('Delete ALL your conversations, messages and artifacts? This cannot be undone.')) return;
    const supabase = createClient();
    await supabase.from('artifacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('conversations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setStatus('All chat data deleted.');
    window.dispatchEvent(new CustomEvent('openclaude:conversations-changed'));
  };

  const exportData = async () => {
    const supabase = createClient();
    const [convs, msgs, artifacts] = await Promise.all([
      supabase.from('conversations').select('*'),
      supabase.from('messages').select('*'),
      supabase.from('artifacts').select('*'),
    ]);
    const blob = new Blob(
      [JSON.stringify({ exported_at: new Date().toISOString(), conversations: convs.data ?? [], messages: msgs.data ?? [], artifacts: artifacts.data ?? [] }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'openclaude-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-scroll">
      <div className="settings-wrap">
        <div className="page-head" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="page-sub">Account, providers, keys and appearance.</p>
          </div>
        </div>

        {status && <div className="auth-ok">{status}</div>}

        {/* account */}
        <section className="settings-section">
          <h2><User size={17} /> Account</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="avatar" style={{ width: 42, height: 42, fontSize: 16 }}>
              {(email || 'oc').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>{email || 'Unknown account'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>Signed in with email</div>
            </div>
            <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={signOut}>
              <LogOut size={15} /> Sign out
            </button>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--border-soft)', paddingTop: 12 }}>
            <button className="btn btn-ghost" onClick={exportData}>
              <Download size={15} /> Export my data (JSON)
            </button>
            <button className="btn btn-danger" onClick={deleteAllData}>
              <Trash2 size={15} /> Delete all chats & artifacts
            </button>
          </div>
        </section>

        {/* providers & keys */}
        <section className="settings-section">
          <h2><KeyRound size={17} /> Providers & API keys</h2>
          <p className="settings-note">
            OpenClaude ships with server-side keys where configured. You can also bring your own key for any
            provider — stored only in this browser (localStorage), sent only to the provider, never to our database.
            All listed providers have generous <strong>free</strong> tiers.
          </p>
          <div>
            {PROVIDERS.map((p) => {
              const server = serverStatus[p.id];
              const clientHas = Boolean(keys[p.id]?.trim());
              const configured = clientHas || server?.configured;
              return (
                <div className="provider-row" key={p.id}>
                  <div className="provider-name">
                    <span className="provider-dot" style={{ background: p.accent, width: 10, height: 10 }} />
                    {p.label}
                  </div>
                  <span className={`badge ${configured ? 'badge-ok' : 'badge-off'}`}>
                    {configured ? (clientHas ? 'Your key' : server?.live ? 'Live' : 'Ready') : 'Needs key'}
                  </span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="password"
                      className="input"
                      style={{ fontSize: 12, padding: '7px 10px' }}
                      placeholder={p.keyRequired ? `${p.envKey} or your own key…` : `${p.envKey} (optional)`}
                      value={keys[p.id] ?? ''}
                      onChange={(e) => setKeys((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <a href={p.keyHelpUrl} target="_blank" rel="noreferrer" className="icon-btn" title={`Get a free ${p.label} key`}>
                      <ExternalLink size={15} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={saveKeys}>
              {saved ? <Check size={15} /> : <KeyRound size={15} />} {saved ? 'Saved' : 'Save my keys'}
            </button>
            <button className="btn btn-ghost" onClick={() => { clearClientKeys(); setKeys({}); setStatus('Browser keys cleared.'); }}>
              Clear my keys
            </button>
          </div>
        </section>

        {/* default model */}
        <section className="settings-section">
          <h2><Sparkles size={17} /> Default model</h2>
          <p className="settings-note">Used for new chats. You can switch models per message from the composer.</p>
          <ModelPicker
            value={defaultChoice}
            onChange={(next) => {
              setDefaultChoice(next);
              localStorage.setItem('openclaude:default-model', encodeModelChoice(next.provider, next.model));
            }}
          />
        </section>

        {/* appearance */}
        <section className="settings-section">
          <h2><Palette size={17} /> Appearance</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>Current theme: <strong style={{ color: 'var(--text)' }}>{theme}</strong></span>
            <button className="btn btn-ghost" onClick={toggleTheme} style={{ marginLeft: 'auto' }}>
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />} Toggle {theme === 'light' ? 'dark' : 'light'} mode
            </button>
          </div>
        </section>

        <p style={{ fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', lineHeight: 1.7 }}>
          OpenClaude v1.0 — an open, multi-provider AI harness inspired by Claude.<br />
          Models via OpenRouter · Google Gemini · Groq · Airforce free tiers. Artifacts render in a sandboxed frame.
        </p>
      </div>
    </div>
  );
}
