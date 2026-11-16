'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Braces,
  Check,
  Copy,
  Download,
  Eye,
  FileCode2,
  FileText,
  GitBranch,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import type { Artifact, ArtifactType } from '@/lib/types';
import { artifactToSrcDoc, downloadArtifact } from '@/lib/artifactPreview';

const TYPE_META: Record<ArtifactType, { label: string; Icon: any; previewable: boolean }> = {
  html: { label: 'HTML', Icon: ImageIcon, previewable: true },
  react: { label: 'React', Icon: Braces, previewable: true },
  markdown: { label: 'Document', Icon: FileText, previewable: true },
  code: { label: 'Code', Icon: FileCode2, previewable: false },
  svg: { label: 'SVG', Icon: ImageIcon, previewable: true },
  mermaid: { label: 'Mermaid', Icon: GitBranch, previewable: true },
};

export default function ArtifactPanel({
  artifacts,
  activeIndex,
  onSelect,
  onClose,
}: {
  artifacts: Artifact[];
  activeIndex: number;
  onSelect: (i: number) => void;
  onClose: () => void;
}) {
  const artifact = artifacts[activeIndex];
  const [view, setView] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!artifact) return;
    setView(TYPE_META[artifact.type].previewable ? 'preview' : 'code');
    setCopied(false);
  }, [artifact?.id, artifact?.type, artifact]);

  const srcDoc = useMemo(
    () => (artifact ? artifactToSrcDoc(artifact) : ''),
    [artifact]
  );

  if (!artifact) return null;
  const meta = TYPE_META[artifact.type];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <aside className="artifact-panel" aria-label="Artifact panel">
      <div className="artifact-head">
        <div className="artifact-tabs">
          {artifacts.map((a, i) => {
            const M = TYPE_META[a.type];
            return (
              <button
                key={a.id + i}
                className={`artifact-tab ${i === activeIndex ? 'active' : ''}`}
                onClick={() => onSelect(i)}
                title={a.title}
              >
                <M.Icon size={13} /> {a.title}
              </button>
            );
          })}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close artifact panel">
          <X size={18} />
        </button>
      </div>

      <div className="artifact-toolbar">
        {meta.previewable && (
          <div className="segmented" role="tablist">
            <button className={view === 'preview' ? 'active' : ''} onClick={() => setView('preview')} role="tab">
              <Eye size={12} style={{ verticalAlign: -2 }} /> Preview
            </button>
            <button className={view === 'code' ? 'active' : ''} onClick={() => setView('code')} role="tab">
              <Braces size={12} style={{ verticalAlign: -2 }} /> Code
            </button>
          </div>
        )}
        <span style={{ flex: 1 }} />
        <button className="icon-btn" onClick={copy} title="Copy contents">
          {copied ? <Check size={16} color="var(--ok)" /> : <Copy size={16} />}
        </button>
        <button className="icon-btn" onClick={() => downloadArtifact(artifact)} title="Download">
          <Download size={16} />
        </button>
      </div>

      <div className="artifact-body">
        {view === 'preview' && meta.previewable ? (
          artifact.type === 'markdown' ? (
            <div className="artifact-md md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown>
            </div>
          ) : (
            <iframe
              key={artifact.id + view}
              title={artifact.title}
              className="artifact-frame"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-modals allow-popups"
            />
          )
        ) : (
          <div className="artifact-code">
            <pre>{artifact.content}</pre>
          </div>
        )}
      </div>

      <div className="artifact-foot">
        <span>
          {meta.label} artifact · {(artifact.content.length / 1024).toFixed(1)} KB
        </span>
        <span>Rendered locally in a sandboxed frame</span>
      </div>
    </aside>
  );
}
