'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Braces, FileCode2, FileText, GitBranch, Image as ImageIcon, Layers, Trash2, ExternalLink, Loader2,
} from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import type { Artifact, ArtifactRow, ArtifactType } from '@/lib/types';
import ArtifactPanel from '@/components/ArtifactPanel';

const TYPE_ICON: Record<string, any> = {
  html: ImageIcon,
  react: Braces,
  markdown: FileText,
  code: FileCode2,
  svg: ImageIcon,
  mermaid: GitBranch,
};

export default function ArtifactsPage() {
  const [rows, setRows] = useState<ArtifactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ArtifactRow | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    supabase
      .from('artifacts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }) => {
        setRows((data as ArtifactRow[]) ?? []);
        setLoading(false);
      });
  }, []);

  const remove = async (row: ArtifactRow, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete artifact "${row.title}"?`)) return;
    const supabase = createClient();
    await supabase.from('artifacts').delete().eq('id', row.id);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    if (selected?.id === row.id) setSelected(null);
  };

  const panelArtifact: Artifact | null = useMemo(
    () =>
      selected
        ? {
            id: selected.id,
            type: (selected.type as ArtifactType) ?? 'code',
            title: selected.title,
            content: selected.content,
          }
        : null,
    [selected]
  );

  return (
    <div className="page-scroll">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1 className="page-title">Artifacts</h1>
            <p className="page-sub">
              Everything OpenClaude has built for you — live previews, documents, diagrams and code.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 60, color: 'var(--text-faint)' }}>
            <Loader2 size={26} className="spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="panel" style={{ alignItems: 'center', textAlign: 'center', padding: 48 }}>
            <Layers size={34} style={{ color: 'var(--text-faint)' }} />
            <h3>No artifacts yet</h3>
            <p className="page-sub" style={{ maxWidth: 380 }}>
              Ask OpenClaude to build something substantial — a web page, a document, an SVG, a diagram —
              and it will appear here.
            </p>
            <Link href="/chat" className="btn btn-primary">Start a chat</Link>
          </div>
        ) : (
          <div className="artifacts-grid">
            {rows.map((row) => {
              const Icon = TYPE_ICON[row.type] ?? FileCode2;
              return (
                <button key={row.id} className="artifact-card" onClick={() => setSelected(row)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="artifact-chip-icon" style={{ width: 32, height: 32 }}>
                      <Icon size={16} />
                    </span>
                    <span className="artifact-chip-type">{row.type}</span>
                    <span style={{ flex: 1 }} />
                    <span
                      role="button"
                      tabIndex={0}
                      className="side-icon-btn"
                      title="Delete artifact"
                      onClick={(e) => remove(row, e as any)}
                      onKeyDown={(e) => e.key === 'Enter' && remove(row, e as any)}
                    >
                      <Trash2 size={13} />
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.4, textAlign: 'left' }}>{row.title}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10.5, color: 'var(--text-faint)' }}>
                    <span>{new Date(row.created_at).toLocaleDateString()}</span>
                    {row.conversation_id && (
                      <Link href={`/chat/${row.conversation_id}`} onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--accent-hover)' }}>
                        Source chat <ExternalLink size={10} />
                      </Link>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* preview overlay */}
      {selected && panelArtifact && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 75, background: 'rgba(8,8,8,0.55)', display: 'flex', justifyContent: 'flex-end' }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{ width: 'min(720px, 100%)', height: '100%', display: 'flex' }}
            onClick={(e) => e.stopPropagation()}
          >
            <ArtifactPanel
              artifacts={[panelArtifact]}
              activeIndex={0}
              onSelect={() => {}}
              onClose={() => setSelected(null)}
            />
          </div>
        </div>
      )}
      <style>{`.spin{animation:rot 1s linear infinite}@keyframes rot{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
