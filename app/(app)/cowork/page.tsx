'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader2,
  Play,
  Plus,
  Square,
  Trash2,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import { getClientKeys } from '@/lib/clientKeys';
import { decodeModelChoice, DEFAULT_MODEL, encodeModelChoice, prettyModelName } from '@/lib/providers';
import type { CoworkBoard, CoworkTask, CoworkStatus } from '@/lib/types';
import ModelPicker, { type ModelChoice } from '@/components/ModelPicker';

const ROLE_COLORS: Record<string, string> = {
  Planner: '#8b5cf6',
  Researcher: '#4285f4',
  Engineer: '#10b981',
  Copywriter: '#ec4899',
  Designer: '#f97316',
  Critic: '#ef4444',
  'Data Analyst': '#14b8a6',
};
const ROLES = Object.keys(ROLE_COLORS);

const COLUMNS: { id: CoworkStatus; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'doing', label: 'In progress' },
  { id: 'done', label: 'Done' },
];

export default function CoworkPage() {
  const [boards, setBoards] = useState<CoworkBoard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tasks, setTasks] = useState<CoworkTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'plan' | 'all' | null>(null);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskRole, setTaskRole] = useState('Researcher');
  const [choice, setChoice] = useState<ModelChoice>(() =>
    decodeModelChoice(typeof window !== 'undefined' ? localStorage.getItem('openclaude:cowork-model') : null)
  );
  const stopRef = useRef(false);

  const activeBoard = boards.find((b) => b.id === activeId) ?? null;
  const doneCount = tasks.filter((t) => t.status === 'done').length;
  const progress = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  const loadBoards = useCallback(async () => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from('cowork_boards')
      .select('*')
      .order('updated_at', { ascending: false });
    const list = (data as CoworkBoard[]) ?? [];
    setBoards(list);
    setActiveId((prev) => prev ?? list[0]?.id ?? null);
    setLoading(false);
  }, []);

  const loadTasks = useCallback(async (boardId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from('cowork_tasks')
      .select('*')
      .eq('board_id', boardId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    setTasks((data as CoworkTask[]) ?? []);
  }, []);

  useEffect(() => {
    loadBoards();
  }, [loadBoards]);

  useEffect(() => {
    if (activeId) loadTasks(activeId);
    else setTasks([]);
  }, [activeId, loadTasks]);

  const createBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { data } = await supabase
      .from('cowork_boards')
      .insert({
        title: newTitle.trim(),
        goal: newGoal.trim(),
        user_id: userData.user?.id,
        coordinator_model: encodeModelChoice(choice.provider, choice.model),
      })
      .select()
      .single();
    setShowNew(false);
    setNewTitle('');
    setNewGoal('');
    await loadBoards();
    if (data) setActiveId(data.id);
  };

  const deleteBoard = async (board: CoworkBoard, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Delete board "${board.title}" and all its tasks?`)) return;
    const supabase = createClient();
    await supabase.from('cowork_boards').delete().eq('id', board.id);
    setActiveId(null);
    loadBoards();
  };

  const postCowork = async (payload: Record<string, unknown>) => {
    const res = await fetch('/api/cowork', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, keys: getClientKeys(), provider: choice.provider, model: choice.model }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
    return data;
  };

  const plan = async () => {
    if (!activeId) return;
    setBusy('plan');
    setError(null);
    try {
      const data = await postCowork({ boardId: activeId, action: 'plan' });
      setTasks(data.tasks ?? []);
    } catch (err: any) {
      setError(err?.message ?? 'Planning failed');
    } finally {
      setBusy(null);
    }
  };

  const executeOne = useCallback(
    async (taskId?: string) => {
      if (!activeId) return null;
      const data = await postCowork({ boardId: activeId, action: 'execute', taskId });
      setTasks(data.tasks ?? []);
      if (data.error) throw new Error(data.error);
      return data;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, choice]
  );

  const runAll = async () => {
    if (!activeId) return;
    stopRef.current = false;
    setBusy('all');
    setError(null);
    try {
      for (;;) {
        if (stopRef.current) break;
        const data = await executeOne();
        const remaining = (data?.tasks ?? []).some((t: CoworkTask) => t.status !== 'done');
        if (!remaining || data?.note) break;
      }
    } catch (err: any) {
      setError(err?.message ?? 'A coworker failed');
    } finally {
      setBusy(null);
      if (activeId) loadTasks(activeId);
    }
  };

  const runTask = async (task: CoworkTask) => {
    setRunningTaskId(task.id);
    setError(null);
    try {
      await executeOne(task.id);
    } catch (err: any) {
      setError(err?.message ?? 'Agent failed');
    } finally {
      setRunningTaskId(null);
    }
  };

  const deleteTask = async (task: CoworkTask) => {
    const supabase = createClient();
    await supabase.from('cowork_tasks').delete().eq('id', task.id);
    if (activeId) loadTasks(activeId);
  };

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !activeId) return;
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const maxPos = tasks.reduce((m, t) => Math.max(m, t.position), -1);
    await supabase.from('cowork_tasks').insert({
      board_id: activeId,
      user_id: userData.user?.id,
      title: taskTitle.trim(),
      role: taskRole,
      provider: choice.provider,
      model: choice.model,
      status: 'todo',
      position: maxPos + 1,
    });
    setTaskTitle('');
    setShowAddTask(false);
    loadTasks(activeId);
  };

  const busyAny = busy !== null || runningTaskId !== null;

  return (
    <div className="cowork-wrap">
      {/* ------- boards rail ------- */}
      <div className="board-list">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '2px 4px' }}>
          <div>
            <h1 className="page-title" style={{ fontSize: 21, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Users size={20} style={{ color: 'var(--accent)' }} /> Cowork
            </h1>
            <p className="page-sub" style={{ fontSize: 11.5 }}>AI coworkers, one shared goal</p>
          </div>
          <button className="btn btn-primary" style={{ padding: '7px 12px' }} onClick={() => setShowNew(true)} aria-label="New board">
            <Plus size={16} />
          </button>
        </div>

        {boards.map((b) => (
          <div
            key={b.id}
            role="button"
            tabIndex={0}
            className={`board-item ${b.id === activeId ? 'active' : ''}`}
            onClick={() => setActiveId(b.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setActiveId(b.id);
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <Bot size={16} style={{ marginTop: 2, color: 'var(--accent-hover)', flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div className="board-item-title">{b.title}</div>
                <div className="board-item-goal">{b.goal || 'No goal set'}</div>
              </div>
              <span
                role="button"
                tabIndex={0}
                aria-label="Delete board"
                className="side-icon-btn"
                style={{ marginLeft: 'auto' }}
                onClick={(e) => {
                  e.stopPropagation();
                  deleteBoard(b, e as any);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') deleteBoard(b, e as any);
                }}
              >
                <Trash2 size={13} />
              </span>
            </div>
          </div>
        ))}
        {!loading && boards.length === 0 && (
          <div className="panel" style={{ fontSize: 13, color: 'var(--text-dim)' }}>
            No boards yet. Create one, give it a goal, and let a team of AI coworkers plan and execute it.
          </div>
        )}
      </div>

      {/* ------- board canvas ------- */}
      <div className="board-main">
        {!activeBoard ? (
          <div className="empty-wrap" style={{ height: '100%' }}>
            <div className="empty-mark"><Users size={26} /></div>
            <h2 className="empty-title serif" style={{ fontSize: 24 }}>Cowork — your AI coworker team</h2>
            <p className="page-sub" style={{ maxWidth: 420 }}>
              Describe a goal. A coordinator decomposes it into tasks; specialist coworkers
              (Planner, Researcher, Engineer, Critic…) execute in sequence, each seeing the others' work.
            </p>
            <button className="btn btn-primary" onClick={() => setShowNew(true)}>
              <Plus size={16} /> Start a Cowork board
            </button>
          </div>
        ) : (
          <>
            <div className="board-head">
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <h2 style={{ fontSize: 19, letterSpacing: '-0.01em' }}>{activeBoard.title}</h2>
                  <p className="board-goal">{activeBoard.goal || 'No goal set — add one by describing what you want.'}</p>
                </div>
                <ModelPicker
                  value={choice}
                  onChange={(next) => {
                    setChoice(next);
                    localStorage.setItem('openclaude:cowork-model', encodeModelChoice(next.provider, next.model));
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-ghost" onClick={plan} disabled={busyAny} title="Decompose the goal into tasks">
                  {busy === 'plan' ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}
                  {busy === 'plan' ? 'Planning…' : 'Plan with AI'}
                </button>
                {busy === 'all' ? (
                  <button className="btn btn-danger" onClick={() => (stopRef.current = true)}>
                    <Square size={14} fill="currentColor" /> Stop team
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={runAll} disabled={busyAny || !tasks.some((t) => t.status !== 'done')}>
                    <Play size={15} /> Run all coworkers
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => setShowAddTask((v) => !v)}>
                  <Plus size={15} /> Add task
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-faint)', marginLeft: 'auto' }}>
                  {doneCount}/{tasks.length} done
                </span>
              </div>
              <div className="progress-track" aria-hidden>
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>

              {showAddTask && (
                <form onSubmit={addTask} style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  <input
                    className="input"
                    style={{ flex: 2, minWidth: 180 }}
                    placeholder="Task title…"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    autoFocus
                  />
                  <select className="select" style={{ width: 140 }} value={taskRole} onChange={(e) => setTaskRole(e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button className="btn btn-primary" type="submit" disabled={!taskTitle.trim()}>Add</button>
                </form>
              )}
              {error && <div className="auth-error" style={{ marginTop: 10 }}>{error}</div>}
            </div>

            <div className="kanban">
              {COLUMNS.map((col) => {
                const colTasks = tasks.filter((t) => t.status === col.id);
                return (
                  <div key={col.id} className="kanban-col">
                    <div className="kanban-col-title">
                      <span>{col.label}</span>
                      <span>{colTasks.length}</span>
                    </div>
                    {colTasks.map((task) => (
                      <article key={task.id} className="task-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className="task-role" style={{ color: ROLE_COLORS[task.role] ?? 'var(--accent-hover)' }}>
                            <span
                              style={{
                                width: 8, height: 8, borderRadius: 99, display: 'inline-block',
                                background: ROLE_COLORS[task.role] ?? 'var(--accent)',
                              }}
                            />
                            {task.role}
                          </span>
                          <span style={{ flex: 1 }} />
                          <button className="side-icon-btn" onClick={() => deleteTask(task)} title="Delete task" aria-label="Delete task">
                            <X size={13} />
                          </button>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.45 }}>{task.title}</div>
                        <div className="task-model" title={task.model}>{task.provider} · {prettyModelName(task.model)}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {task.status === 'doing' || runningTaskId === task.id ? (
                            <span className="agent-busy"><Loader2 size={13} className="spin" /> Working…</span>
                          ) : task.status === 'done' ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ok)' }}>
                              <CheckCircle2 size={13} /> Delivered
                            </span>
                          ) : (
                            <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => runTask(task)} disabled={busyAny}>
                              <Play size={12} /> Run
                            </button>
                          )}
                          {task.status !== 'done' && !(task.status === 'doing') && runningTaskId !== task.id && (
                            <Circle size={13} style={{ color: 'var(--text-faint)' }} />
                          )}
                        </div>
                        {task.result && (
                          <details>
                            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--accent-hover)', userSelect: 'none' }}>
                              View deliverable
                            </summary>
                            <div className="task-result md">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.result}</ReactMarkdown>
                            </div>
                          </details>
                        )}
                      </article>
                    ))}
                    {colTasks.length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--text-faint)', padding: '8px 6px' }}>
                        {col.id === 'todo' ? 'Nothing queued' : col.id === 'doing' ? 'Nothing running' : 'Nothing delivered yet'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ------- new board modal ------- */}
      {showNew && (
        <div className="modal-backdrop" onClick={() => setShowNew(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={createBoard}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Users size={18} /> New Cowork board</h2>
              <button type="button" className="icon-btn" onClick={() => setShowNew(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="field">
              <label htmlFor="cb-title">Board title</label>
              <input id="cb-title" className="input" placeholder="e.g. Launch Q3 marketing campaign" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} autoFocus required />
            </div>
            <div className="field">
              <label htmlFor="cb-goal">Goal for the AI team</label>
              <textarea id="cb-goal" className="textarea" style={{ minHeight: 110 }} placeholder="Describe the outcome you want. The coordinator will break this into tasks for specialist coworkers." value={newGoal} onChange={(e) => setNewGoal(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!newTitle.trim()}>Create board</button>
            </div>
          </form>
        </div>
      )}
      <style>{`.spin{animation:rot 1s linear infinite}@keyframes rot{to{transform:rotate(360deg)}} details summary::marker{color:var(--accent)}`}</style>
    </div>
  );
}
