'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';

export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // Cmd/Ctrl + K → new chat
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        router.push('/chat');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [router]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="app-shell">
      <Sidebar open={open} onClose={close} />
      <div className={`sidebar-overlay ${open ? 'show' : ''}`} onClick={close} aria-hidden />
      <div className="app-main">
        <div className="mobile-topbar">
          <button className="icon-btn" onClick={() => setOpen(true)} aria-label="Open sidebar">
            <Menu size={20} />
          </button>
          <span className="serif" style={{ fontWeight: 600 }}>
            Open<span style={{ color: 'var(--accent)' }}>Claude</span>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
