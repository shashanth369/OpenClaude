'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  Plus,
  Search,
  FolderGit2,
  Users,
  Layers,
  Settings,
  Sun,
  Moon,
  LogOut,
  Star,
  Trash2,
  Pencil,
  X,
  Check,
  MessageSquare,
} from 'lucide-react';
import { createClient, supabaseConfigured } from '@/lib/supabase/client';
import type { Conversation } from '@/lib/types';

export function notifyConversationsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('openclaude:conversations-changed'));
  }
}

function groupByAge(list: Conversation[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const groups = [
    { label: 'Today', items: [] as Conversation[] },
    { label: 'Yesterday', items: [] as Conversation[] },
    { label: 'Previous 7 days', items: [] as Conversation[] },
    { label: 'Older', items: [] as Conversation[] },
  ];
  for (const c of list) {
    const t = new Date(c.updated_at).getTime();
    if (t >= startOfToday) groups[0].items.push(c);
    else if (t >= startOfToday - day) groups[1].items.push(c);
    else if (t >= startOfToday - 7 * day) groups[2].items.push(c);
    else groups[3].items.push(c);
  }
  return groups.filter((g) => g.items.length > 0);
}

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState('');
  const [userEmail, setUserEmail] = useState<string>('');
  const [theme, setTheme] = useState<string>('dark');
  const [loaded, setLoaded] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || 'dark');
  }, []);

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(120);
    setConversations((data as Conversation[]) ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener('openclaude:conversations-changed', onChange);
    return () => window.removeEventListener('openclaude:conversations-changed', onChange);
  }, [refresh]);

  useEffect(() => {
    if (!supabaseConfigured) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ''));
  }, []);

  // close drawer on navigation (mobile)
  useEffect(() => {
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleTheme = () => {
    const next = (document.documentElement.dataset.theme === 'light' ? 'dark' : 'light') as string;
    document.documentElement.dataset.theme = next;
    localStorage.setItem('openclaude-theme', next);
    setTheme(next);
  };

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const toggleStar = async (c: Conversation, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const supabase = createClient();
    await supabase.from('conversations').update({ starred: !c.starred }).eq('id', c.id);
    refresh();
  };

  const removeConversation = async (c: Conversation, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
    const supabase = createClient();
    await supabase.from('conversations').delete().eq('id', c.id);
    if (pathname === `/chat/${c.id}`) router.push('/chat');
    refresh();
  };

  const startRename = (c: Conversation, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRenaming(c.id);
    setRenameValue(c.title);
  };

  const commitRename = async () => {
    if (!renaming) return;
    const title = renameValue.trim();
    if (title) {
      const supabase = createClient();
      await supabase.from('conversations').update({ title }).eq('id', renaming);
    }
    setRenaming(null);
    refresh();
  };

  const filtered = query.trim()
    ? conversations.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))
    : conversations;
  const starred = filtered.filter((c) => c.starred);
  const recent = filtered.filter((c) => !c.starred);
  const groups = groupByAge(recent);

  const renderItem = (c: Conversation) => {
    const active = pathname === `/chat/${c.id}`;
    if (renaming === c.id) {
      return (
        <div key={c.id} className="side-item active">
          <input
            className="input"
            style={{ padding: '4px 8px', fontSize: 13 }}
            value={renameValue}
            autoFocus
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(null);
            }}
          />
          <button className="side-icon-btn" onClick={commitRename} aria-label="Save">
            <Check size={14} />
          </button>
          <button className="side-icon-btn" onClick={() => setRenaming(null)} aria-label="Cancel">
            <X size={14} />
          </button>
        </div>
      );
    }
    return (
      <Link key={c.id} href={`/chat/${c.id}`} className={`side-item ${active ? 'active' : ''}`}>
        <MessageSquare size={15} style={{ flexShrink: 0, opacity: 0.6 }} />
        <span className="side-item-title">{c.title}</span>
        <span className="side-item-actions">
          <button className={`side-icon-btn ${c.starred ? 'starred' : ''}`} onClick={(e) => toggleStar(c, e)} title="Star">
            <Star size={14} fill={c.starred ? 'currentColor' : 'none'} />
          </button>
          <button className="side-icon-btn" onClick={(e) => startRename(c, e)} title="Rename">
            <Pencil size={14} />
          </button>
          <button className="side-icon-btn" onClick={(e) => removeConversation(c, e)} title="Delete">
            <Trash2 size={14} />
          </button>
        </span>
      </Link>
    );
  };

  const initials = userEmail ? userEmail.slice(0, 2) : 'OC';

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Sidebar">
      <div className="sidebar-inner">
        <Link href="/chat" className="brand">
          <div className="brand-mark" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 100 100">
              <g stroke="#fff" strokeWidth="11" strokeLinecap="round">
                <line x1="50" y1="10" x2="50" y2="90" />
                <line x1="15" y1="30" x2="85" y2="70" />
                <line x1="15" y1="70" x2="85" y2="30" />
                <line x1="10" y1="50" x2="90" y2="50" />
              </g>
            </svg>
          </div>
          <div>
            <span className="brand-name">
              Open<span>Claude</span>
            </span>
            <span className="brand-sub">Multi-provider harness</span>
          </div>
        </Link>

        <Link href="/chat" className="new-chat-btn">
          <Plus size={17} /> New chat <kbd>⌘K</kbd>
        </Link>

        <nav className="side-nav">
          <Link href="/projects" className={`side-nav-item ${pathname.startsWith('/projects') ? 'active' : ''}`}>
            <FolderGit2 size={16} /> Projects
          </Link>
          <Link href="/cowork" className={`side-nav-item ${pathname.startsWith('/cowork') ? 'active' : ''}`}>
            <Users size={16} /> Cowork
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent-hover)', border: '1px solid var(--accent)', padding: '1px 6px', borderRadius: 99 }}>BETA</span>
          </Link>
          <Link href="/artifacts" className={`side-nav-item ${pathname.startsWith('/artifacts') ? 'active' : ''}`}>
            <Layers size={16} /> Artifacts
          </Link>
        </nav>

        <label className="side-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats…"
            aria-label="Search chats"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </label>

        <div className="side-scroll">
          {starred.length > 0 && (
            <>
              <div className="side-section-title">Starred</div>
              {starred.map(renderItem)}
            </>
          )}
          {groups.map((g) => (
            <div key={g.label}>
              <div className="side-section-title">{g.label}</div>
              {g.items.map(renderItem)}
            </div>
          ))}
          {loaded && filtered.length === 0 && (
            <div className="side-empty">{query ? 'No chats match your search.' : 'No conversations yet — start one below the fold.'}</div>
          )}
        </div>

        <div className="sidebar-foot">
          <div className="side-foot-row">
            <div className="avatar">{initials}</div>
            <div className="foot-email" title={userEmail}>
              {userEmail || 'Not signed in'}
            </div>
            <button className="icon-btn" onClick={toggleTheme} title="Toggle theme" aria-label="Toggle theme">
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
            </button>
            <Link href="/settings" className="icon-btn" title="Settings" aria-label="Settings">
              <Settings size={17} />
            </Link>
            <button className="icon-btn" onClick={signOut} title="Sign out" aria-label="Sign out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
