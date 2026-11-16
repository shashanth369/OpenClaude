'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUp,
  Square,
  FolderGit2,
  Layers,
  Star,
  Loader2,
} from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import { getClientKeys } from '@/lib/clientKeys';
import { extractArtifacts } from '@/lib/artifacts';
import { decodeModelChoice, DEFAULT_MODEL, encodeModelChoice } from '@/lib/providers';
import type { Artifact, Project } from '@/lib/types';
import ModelPicker, { type ModelChoice } from './ModelPicker';
import MessageView from './MessageView';
import ArtifactPanel from './ArtifactPanel';
import { notifyConversationsChanged } from './Sidebar';

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  provider?: string | null;
  model?: string | null;
}

export default function ChatInterface({
  conversationId = null,
  projectId = null,
}: {
  conversationId?: string | null;
  projectId?: string | null;
}) {
  const [convId, setConvId] = useState<string | null>(conversationId);
  const [project, setProject] = useState<Project | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(Boolean(conversationId));
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<ModelChoice>(() => decodeModelChoice(null));
  const [starred, setStarred] = useState(false);
  const [panel, setPanel] = useState<{ msgIndex: number; artifactIndex: number } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---------- load ----------
  useEffect(() => {
    if (!supabaseConfigured) {
      setLoadingHistory(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const supabase = createClient();
      if (projectId) {
        const { data } = await supabase.from('projects').select('*').eq('id', projectId).single();
        if (!cancelled && data) setProject(data as Project);
      }
      if (conversationId) {
        setLoadingHistory(true);
        const { data: conv } = await supabase
          .from('conversations')
          .select('*')
          .eq('id', conversationId)
          .single();
        if (conv) {
          setStarred(Boolean(conv.starred));
          if (conv.model) setChoice({ provider: (conv.provider ?? 'openrouter') as any, model: conv.model });
          if (conv.project_id && !projectId) {
            const { data: p } = await supabase.from('projects').select('*').eq('id', conv.project_id).single();
            if (p) setProject(p as Project);
          }
        }
        const { data: msgs } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });
        if (!cancelled) {
          setMessages(
            ((msgs ?? []) as any[]).map((m) => ({
              role: m.role,
              content: m.content,
              provider: m.provider,
              model: m.model,
            }))
          );
          setLoadingHistory(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, projectId]);

  // default model from localStorage (unless conversation overrides)
  useEffect(() => {
    if (!conversationId) {
      const saved = typeof window !== 'undefined' ? localStorage.getItem('openclaude:default-model') : null;
      if (saved) setChoice(decodeModelChoice(saved));
    }
  }, [conversationId]);

  // ---------- derived ----------
  const messagesArtifacts = useMemo(
    () => messages.map((m) => (m.role === 'assistant' ? extractArtifacts(m.content).artifacts : [])),
    [messages]
  );
  const totalArtifacts = useMemo(
    () => messagesArtifacts.reduce((acc, a) => acc + a.length, 0),
    [messagesArtifacts]
  );

  // ---------- autoscroll ----------
  useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // ---------- send / stop ----------
  const setAssistantContent = useCallback((content: string) => {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant') {
          next[i] = { ...next[i], content };
          break;
        }
      }
      return next;
    });
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setError(null);
    pinnedRef.current = true;

    const supabase = supabaseConfigured ? createClient() : null;
    let userId: string | null = null;
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    }

    let id = convId;
    if (!id && supabase) {
      const title = text.length > 60 ? text.slice(0, 57) + '…' : text;
      const { data, error: insertError } = await supabase
        .from('conversations')
        .insert({
          title,
          project_id: project?.id ?? projectId ?? null,
          provider: choice.provider,
          model: choice.model,
          user_id: userId,
        })
        .select()
        .single();
      if (insertError) {
        setError(`Could not create conversation: ${insertError.message}`);
        return;
      }
      id = data.id as string;
      setConvId(id);
      window.history.replaceState(null, '', `/chat/${id}`);
      notifyConversationsChanged();
    }

    const userMsg: Msg = { role: 'user', content: text };
    const baseMessages = [...messages, userMsg];
    setMessages([
      ...baseMessages,
      { role: 'assistant', content: '', provider: choice.provider, model: choice.model },
    ]);
    setInput('');
    setStreaming(true);
    requestAnimationFrame(() => {
      if (inputRef.current) inputRef.current.style.height = 'auto';
    });

    if (supabase && id) {
      supabase
        .from('messages')
        .insert({ conversation_id: id, user_id: userId, role: 'user', content: text })
        .then(() => {});
      supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString(), provider: choice.provider, model: choice.model })
        .eq('id', id)
        .then(() => notifyConversationsChanged());
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    let full = '';
    let streamError: string | null = null;

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: baseMessages.map(({ role, content }) => ({ role, content })),
          provider: choice.provider,
          model: choice.model,
          projectInstructions: project?.instructions ?? '',
          keys: getClientKeys(),
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        let msg = `Request failed (${res.status})`;
        try {
          const j = await res.json();
          msg = j?.error ?? msg;
        } catch {}
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const ev of events) {
          const line = ev.split('\n').find((l) => l.trim().startsWith('data:'));
          if (!line) continue;
          const payload = line.trim().slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            if (json?.error) streamError = String(json.error);
            else if (typeof json?.content === 'string' && json.content) {
              full += json.content;
              setAssistantContent(full);
            }
          } catch {
            // keep-alive or partial frame — ignore
          }
        }
      }
      if (streamError) throw new Error(streamError);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // user stopped — keep whatever streamed
      } else {
        setError(err?.message ?? 'Something went wrong');
      }
    } finally {
      const { artifacts } = extractArtifacts(full);
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === 'assistant') {
            next[i] = { ...next[i], content: full };
            break;
          }
        }
        return next;
      });
      setStreaming(false);
      abortRef.current = null;

      if (supabase && id && full.trim()) {
        const { data: ins } = await supabase
          .from('messages')
          .insert({
            conversation_id: id,
            user_id: userId,
            role: 'assistant',
            content: full,
            provider: choice.provider,
            model: choice.model,
            artifacts: artifacts.map((a) => ({ title: a.title, type: a.type })),
          })
          .select('id')
          .single();
        if (ins && artifacts.length) {
          await supabase.from('artifacts').insert(
            artifacts.map((a) => ({
              user_id: userId,
              conversation_id: id,
              message_id: ins.id,
              title: a.title,
              type: a.type,
              content: a.content,
            }))
          );
        }
        notifyConversationsChanged();
      }
    }
  }, [input, streaming, convId, messages, choice, project, projectId, setAssistantContent]);

  const stop = () => abortRef.current?.abort();

  const toggleStar = async () => {
    if (!convId || !supabaseConfigured) return;
    const supabase = createClient();
    const next = !starred;
    setStarred(next);
    await supabase.from('conversations').update({ starred: next }).eq('id', convId);
    notifyConversationsChanged();
  };

  const openArtifact = (msgIndex: number, artifactIndex: number) =>
    setPanel({ msgIndex, artifactIndex });

  const openLastArtifact = () => {
    for (let i = messagesArtifacts.length - 1; i >= 0; i--) {
      if (messagesArtifacts[i].length) {
        setPanel({ msgIndex: i, artifactIndex: messagesArtifacts[i].length - 1 });
        return;
      }
    }
  };

  const panelArtifacts: Artifact[] | null = panel ? messagesArtifacts[panel.msgIndex] ?? null : null;

  const isEmpty = messages.length === 0 && !loadingHistory;
  const suggestions = [
    'Create an animated SVG logo for "Nova" and show it live',
    'Build a personal finance dashboard as a web page',
    'Explain how neural networks learn, in plain language',
    'Draft a product launch email, then critique your own draft',
  ];

  return (
    <div className="chat-layout">
      <div className="chat-column">
        {/* slim header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 16px',
            borderBottom: '1px solid var(--border-soft)',
            minHeight: 44,
          }}
        >
          {project && (
            <Link
              href={`/projects/${project.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
                color: 'var(--text-dim)', background: 'var(--bg-elev)',
                borderRadius: 99, padding: '4px 12px', border: '1px solid var(--border)',
              }}
            >
              <FolderGit2 size={12} /> {project.name}
            </Link>
          )}
          <span style={{ flex: 1 }} />
          {totalArtifacts > 0 && (
            <button className="icon-btn" onClick={openLastArtifact} title="Open artifacts" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-dim)' }}>
              <Layers size={16} /> {totalArtifacts}
            </button>
          )}
          {convId && (
            <button className="icon-btn" onClick={toggleStar} title={starred ? 'Unstar chat' : 'Star chat'}>
              <Star size={17} fill={starred ? 'currentColor' : 'none'} color={starred ? 'var(--warn)' : 'currentColor'} />
            </button>
          )}
        </div>

        {/* messages */}
        <div className="chat-scroll" ref={scrollRef} onScroll={onScroll}>
          {loadingHistory ? (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--text-faint)' }}>
              <Loader2 size={26} className="spin" />
            </div>
          ) : isEmpty ? (
            <div className="empty-wrap">
              <div className="empty-mark">
                <svg width="30" height="30" viewBox="0 0 100 100">
                  <g stroke="#fff" strokeWidth="11" strokeLinecap="round">
                    <line x1="50" y1="10" x2="50" y2="90" />
                    <line x1="15" y1="30" x2="85" y2="70" />
                    <line x1="15" y1="70" x2="85" y2="30" />
                    <line x1="10" y1="50" x2="90" y2="50" />
                  </g>
                </svg>
              </div>
              <h1 className="empty-title serif">
                {project ? `Working in ${project.name}` : 'How can I help you today?'}
              </h1>
              <div className="suggestions">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    className="suggestion-chip"
                    onClick={() => {
                      setInput(s);
                      inputRef.current?.focus();
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-inner">
              {messages.map((m, i) => (
                <div key={i}>
                  {m.role === 'assistant' && m.content.length === 0 && streaming ? (
                    <div className="msg msg-assistant">
                      <div className="avatar-sm" aria-hidden>
                        <svg width="14" height="14" viewBox="0 0 100 100">
                          <g stroke="#fff" strokeWidth="12" strokeLinecap="round">
                            <line x1="50" y1="10" x2="50" y2="90" />
                            <line x1="15" y1="30" x2="85" y2="70" />
                            <line x1="15" y1="70" x2="85" y2="30" />
                            <line x1="10" y1="50" x2="90" y2="50" />
                          </g>
                        </svg>
                      </div>
                      <div className="typing" aria-label="Model is thinking"><i /><i /><i /></div>
                    </div>
                  ) : (
                    <MessageView
                      role={m.role}
                      content={m.content}
                      provider={m.provider}
                      model={m.model}
                      artifacts={messagesArtifacts[i] ?? []}
                      streaming={streaming && i === messages.length - 1 && m.role === 'assistant'}
                      onOpenArtifact={(ai) => openArtifact(i, ai)}
                    />
                  )}
                </div>
              ))}
              {error && (
                <div className="auth-error" role="alert">
                  {error}
                  <button style={{ display: 'block', marginTop: 8, textDecoration: 'underline' }} onClick={() => setError(null)}>
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* composer */}
        <div className="composer-wrap">
          <div className="composer">
            <textarea
              ref={inputRef}
              className="composer-input"
              rows={1}
              placeholder={project ? `Message in ${project.name}…` : 'How can I help you today?'}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 260) + 'px';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              aria-label="Message OpenClaude"
            />
            <div className="composer-bottom">
              <ModelPicker
                value={choice}
                onChange={(next) => {
                  setChoice(next);
                  localStorage.setItem('openclaude:default-model', encodeModelChoice(next.provider, next.model));
                }}
              />
              <span className="composer-hint">Enter to send · Shift+Enter newline</span>
              {streaming ? (
                <button className="stop-btn" onClick={stop} aria-label="Stop generating">
                  <Square size={15} fill="currentColor" />
                </button>
              ) : (
                <button className="send-btn" onClick={send} disabled={!input.trim()} aria-label="Send">
                  <ArrowUp size={17} />
                </button>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 10.5, color: 'var(--text-faint)', marginTop: 8 }}>
            OpenClaude is a free, open multi-provider harness — models can make mistakes. Verify important information.
          </div>
        </div>
      </div>

      {/* artifact panel */}
      {panel && panelArtifacts && panelArtifacts.length > 0 && (
        <ArtifactPanel
          artifacts={panelArtifacts}
          activeIndex={Math.min(panel.artifactIndex, panelArtifacts.length - 1)}
          onSelect={(artifactIndex) => setPanel({ ...panel, artifactIndex })}
          onClose={() => setPanel(null)}
        />
      )}
      <style>{`.spin{animation:rot 1s linear infinite}@keyframes rot{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
