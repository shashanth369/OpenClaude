'use client';

import { useMemo, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Check,
  Copy,
  Braces,
  FileCode2,
  FileText,
  GitBranch,
  Image as ImageIcon,
} from 'lucide-react';
import type { Artifact, ArtifactType } from '@/lib/types';
import { renderableText, isArtifactStreaming, extractArtifacts } from '@/lib/artifacts';

const TYPE_ICON: Record<ArtifactType, any> = {
  html: ImageIcon,
  react: Braces,
  markdown: FileText,
  code: FileCode2,
  svg: ImageIcon,
  mermaid: GitBranch,
};

/** Extract raw text content from a React node tree (for code-block copy). */
function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join('');
  if (typeof node === 'object' && 'props' in (node as any)) {
    return nodeToText((node as any).props?.children);
  }
  return '';
}

function CopyButton({ getText, label }: { getText: () => string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="code-copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {}
      }}
    >
      {done ? (label ? 'Copied!' : 'Copied') : 'Copy'}
    </button>
  );
}

export default function MessageView({
  role,
  content,
  provider,
  model,
  artifacts,
  streaming,
  onOpenArtifact,
}: {
  role: 'user' | 'assistant' | 'system';
  content: string;
  provider?: string | null;
  model?: string | null;
  artifacts: Artifact[];
  streaming?: boolean;
  onOpenArtifact?: (index: number) => void;
}) {
  const text = streaming ? renderableText(content) : extractArtifacts(content).stripped;

  const markdownComponents = useMemo(
    () => ({
      pre: ({ children }: any) => {
        const raw = nodeToText(children);
        return (
          <div className="code-block-wrap">
            {children}
            <CopyButton getText={() => raw} />
          </div>
        );
      },
    }),
    []
  );

  if (role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="bubble">{content}</div>
      </div>
    );
  }

  const showCaret = streaming && isArtifactStreaming(content);
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {}
  };

  return (
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
      <div className="msg-assistant-body">
        <div className="md">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {text.length ? text : ' '}
          </ReactMarkdown>
          {streaming && <span className="streaming-dot" aria-hidden />}
        </div>

        {showCaret && (
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 6 }}>
            Writing artifact…
          </div>
        )}

        {artifacts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {artifacts.map((a, i) => {
              const Icon = TYPE_ICON[a.type];
              return (
                <button key={a.id + i} className="artifact-chip" onClick={() => onOpenArtifact?.(i)}>
                  <span className="artifact-chip-icon">
                    <Icon size={17} />
                  </span>
                  <span className="artifact-chip-meta">
                    <span className="artifact-chip-title">{a.title}</span>
                    <span className="artifact-chip-type">{a.type} · click to open</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {!streaming && (
          <div className="msg-foot">
            <button className="icon-btn" onClick={copyAll} title="Copy message" style={{ padding: 5 }}>
              <Copy size={14} />
            </button>
            {model && (
              <span className="msg-model-tag">
                {provider ? `${provider} · ` : ''}
                {model.split('/').pop()}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
