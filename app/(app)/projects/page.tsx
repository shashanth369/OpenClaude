'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderGit2, Plus, X } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import type { Project } from '@/lib/types';

const SWATCHES = ['#c96442', '#8b5cf6', '#4285f4', '#10b981', '#f97316', '#ec4899', '#64748b'];

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [color, setColor] = useState(SWATCHES[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data: projs } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });
    setProjects((projs as Project[]) ?? []);
    const { data: convs } = await supabase.from('conversations').select('project_id');
    const agg: Record<string, number> = {};
    (convs ?? []).forEach((c: any) => {
      if (c.project_id) agg[c.project_id] = (agg[c.project_id] ?? 0) + 1;
    });
    setCounts(agg);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from('projects').insert({
      name: name.trim(),
      description: description.trim(),
      instructions: instructions.trim(),
      color,
      user_id: userData.user?.id,
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setShowModal(false);
    setName('');
    setDescription('');
    setInstructions('');
    setColor(SWATCHES[0]);
    load();
  };

  return (
    <div className="page-scroll">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <h1 className="page-title">Projects</h1>
            <p className="page-sub">
              Group chats under a shared brief — instructions you set here are applied to every
              conversation inside the project.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            <Plus size={16} /> New project
          </button>
        </div>

        {loading ? (
          <p className="page-sub">Loading projects…</p>
        ) : (
          <div className="projects-grid">
            {projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="project-card">
                <div className="project-icon" style={{ background: p.color }}>
                  <FolderGit2 size={19} />
                </div>
                <h3>{p.name}</h3>
                <p>{p.description || p.instructions || 'No description yet.'}</p>
                <div className="project-meta">
                  <span>{counts[p.id] ?? 0} chats</span>
                  <span>·</span>
                  <span>updated {new Date(p.updated_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
            {projects.length === 0 && (
              <div className="panel" style={{ gridColumn: '1 / -1', alignItems: 'center', textAlign: 'center', padding: 40 }}>
                <FolderGit2 size={34} style={{ color: 'var(--text-faint)' }} />
                <h3>No projects yet</h3>
                <p className="page-sub">Create your first project to give OpenClaude standing instructions.</p>
                <button className="btn btn-primary" onClick={() => setShowModal(true)}>
                  <Plus size={16} /> Create project
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createProject}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2>New project</h2>
              <button type="button" className="icon-btn" onClick={() => setShowModal(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            {error && <div className="auth-error">{error}</div>}
            <div className="field">
              <label htmlFor="p-name">Name</label>
              <input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Website redesign" autoFocus required />
            </div>
            <div className="field">
              <label htmlFor="p-desc">Description</label>
              <input id="p-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" />
            </div>
            <div className="field">
              <label htmlFor="p-instructions">Standing instructions (added to every chat)</label>
              <textarea id="p-instructions" className="textarea" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="e.g. You are helping me build a Next.js storefront. Always prefer TypeScript, keep answers terse, and cite file paths." />
            </div>
            <div className="field">
              <label>Color</label>
              <div className="color-swatches">
                {SWATCHES.map((s) => (
                  <button key={s} type="button" className={`swatch ${color === s ? 'active' : ''}`} style={{ background: s }} onClick={() => setColor(s)} aria-label={`Color ${s}`} />
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
                {saving ? 'Creating…' : 'Create project'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
