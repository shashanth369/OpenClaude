'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import { getClientKeys } from '@/lib/clientKeys';
import { prettyModelName } from '@/lib/providers';
import type { ProviderId } from '@/lib/types';

export interface ModelChoice {
  provider: ProviderId;
  model: string;
}

interface ProviderCatalog {
  id: ProviderId;
  label: string;
  tagline: string;
  accent: string;
  keyRequired: boolean;
  keyHelpUrl: string;
  envKey: string;
  configured: boolean;
  live: boolean;
  models: string[];
}

export default function ModelPicker({
  value,
  onChange,
}: {
  value: ModelChoice;
  onChange: (next: ModelChoice) => void;
}) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<ProviderCatalog[] | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    if (!open || catalog) return;
    setLoading(true);
    fetch('/api/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: getClientKeys() }),
    })
      .then((r) => r.json())
      .then((data) => setCatalog(data?.providers ?? []))
      .catch(() => setCatalog([]))
      .finally(() => setLoading(false));
  }, [open, catalog]);

  const active = catalog?.find((p) => p.id === value.provider);
  const accent = active?.accent ?? '#c96442';

  return (
    <div className="model-picker" ref={ref}>
      <button className="model-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <span className="provider-dot" style={{ background: accent }} />
        <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {prettyModelName(value.model)}
        </span>
        <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
      </button>

      {open && (
        <div className="model-menu" role="listbox">
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px', color: 'var(--text-dim)', fontSize: 13 }}>
              <Loader2 size={14} className="spin" /> Loading free model catalog…
            </div>
          )}
          {catalog?.map((p) => (
            <div key={p.id}>
              <div className="model-provider">
                <span className="provider-dot" style={{ background: p.accent }} />
                {p.label}
                <span className={`status ${p.configured ? 'status-ok' : 'status-off'}`}>
                  {p.configured ? (p.live ? 'LIVE' : 'READY') : 'NEEDS KEY'}
                </span>
              </div>
              {p.models.slice(0, 14).map((m) => {
                const disabled = p.keyRequired && !p.configured;
                const selected = value.provider === p.id && value.model === m;
                return (
                  <button
                    key={m}
                    role="option"
                    aria-selected={selected}
                    disabled={disabled}
                    title={disabled ? `Set ${p.envKey} on the server or add your own key in Settings` : m}
                    className={`model-option ${selected ? 'selected' : ''}`}
                    style={disabled ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                    onClick={() => {
                      onChange({ provider: p.id, model: m });
                      setOpen(false);
                    }}
                  >
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {prettyModelName(m)}
                    </span>
                    {selected && <Check size={14} />}
                  </button>
                );
              })}
              {p.keyRequired && !p.configured && (
                <a
                  href={p.keyHelpUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="model-option"
                  style={{ color: 'var(--accent-hover)', fontSize: 12 }}
                >
                  <ExternalLink size={12} /> Get a free {p.label} key
                </a>
              )}
            </div>
          ))}
          {!loading && catalog && catalog.every((p) => p.models.length === 0) && (
            <div style={{ padding: 14, fontSize: 13, color: 'var(--text-dim)' }}>
              Couldn't load the catalog. Check provider keys in Settings.
            </div>
          )}
        </div>
      )}
      <style>{`.spin{animation:rot 1s linear infinite}@keyframes rot{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
