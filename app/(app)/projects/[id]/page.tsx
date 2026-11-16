'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FolderGit2, MessageSquare, Plus, Save, Trash2, Loader2 } from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import type { Conversation, Project } from '@/lib/types';

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [project, setProject] = useState<Project | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [instructions, setInstructions] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!supabaseConfigured || !id) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data: p } = await supabase.from('projects').select('*').eq('id', id).single();
    if (p) {
      setProject(p as Project);
      setInstructions(p.instructions ?? '');
      setName(p.name ?? '');
      setDescription(p.description ?? '');
    }
    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .eq('project_id', id)
      .order('updated_at', { ascending: false });
    setConversations((convs as Conversation[]) ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!id) return;
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from('projects')
      .update({ name: name.trim() || 'Untitled', description: description.trim(), instructions })
      .eq('id', id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
    load();
  };

  const removeProject = async () => {
    if (!id || !project) return;
    if (!window.confirm(`Delete project "${project.name}" and all its chats? This cannot be undone.`)) return;
    const supabase = createClient();
    await supabase.from('projects').delete().eq('id', id);
    router.push('/projects');
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text-faint)' }}>
        <Loader2 size={26} className="spin" />
      </div>
    );
  }
  if (!project) {
    return (
      <div className="page-inner">
        <p className="page-sub">Project not found.</p>
        <Link href="/projects" className="btn btn-ghost" style={{ marginTop: 12 }}>
          <ArrowLeft size={15} /> Back to projects
        </Link>
      </div>
    );
  }

  return (
    <div className="page-scroll">
      <div className="page-inner">
        <div className="page-head">
          <div>
            <Link href="/projects" className="page-sub" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <ArrowLeft size={13} /> Projects
            </Link>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="project-icon" style={{ background: project.color, width: 34, height: 34, borderRadius: 9 }}>
                <FolderGit2 size={18} />
              </span>
              {project.name}
            </h1>
          </div>
          <button className="btn btn-primary" onClick={() => router.push(`/chat?project=${project.id}`)}>
            <Plus size={16} /> New chat in project
          </button>
        </div>

        <div className="project-detail">
          <div className="panel">
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>Brief & instructions</h2>
            <div className="field">
              <label htmlFor="pd-name">Name</label>
              <input id="pd-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pd-desc">Description</label>
              <input id="pd-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pd-instructions">Standing instructions</label>
              <textarea
                id="pd-instructions"
                className="textarea"
                style={{ minHeight: 180 }}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="What should OpenClaude know for every chat in this project? Style, stack, constraints, tone…"
              />
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                <Save size={15} /> {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
              </button>
              <button className="btn btn-danger" onClick={removeProject} style={{ marginLeft: 'auto' }}>
                <Trash2 size={15} /> Delete
              </button>
            </div>
          </div>

          <div className="panel">
            <h2 style={{ fontSize: 15, fontWeight: 600 }}>
              Conversations <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({conversations.length})</span>
            </h2>
            {conversations.length === 0 && (
              <p className="page-sub">No chats in this project yet. Start one — it will inherit the brief.</p>
            )}
            {conversations.map((c) => (
              <Link key={c.id} href={`/chat/${c.id}`} className="conv-row">
                <MessageSquare size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>
                  {c.title}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  {new Date(c.updated_at).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <style>{`.spin{animation:rot 1s linear infinite}@keyframes rot{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
