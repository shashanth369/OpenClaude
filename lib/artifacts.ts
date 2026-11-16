import type { Artifact, ArtifactType } from './types';

const ARTIFACT_RE = /<artifact\s+([^>]*)>([\s\S]*?)<\/artifact>/g;
const OPEN_TAG_RE = /<artifact(\s[^>]*)?>/;

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /(\w+)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) attrs[m[1].toLowerCase()] = m[2];
  return attrs;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const normalizeType = (t: string | undefined): ArtifactType => {
  const v = (t ?? 'code').toLowerCase();
  if (v === 'html' || v === 'htm') return 'html';
  if (v === 'react' || v === 'jsx' || v === 'tsx' || v === 'component') return 'react';
  if (v === 'markdown' || v === 'md') return 'markdown';
  if (v === 'svg') return 'svg';
  if (v === 'mermaid') return 'mermaid';
  return 'code';
};

/** Extract <artifact> blocks from a completed assistant message. */
export function extractArtifacts(text: string): {
  artifacts: Artifact[];
  stripped: string;
} {
  const artifacts: Artifact[] = [];
  const stripped = text.replace(ARTIFACT_RE, (_full, attrsRaw: string, body: string) => {
    const attrs = parseAttrs(attrsRaw ?? '');
    artifacts.push({
      id: uid(),
      type: normalizeType(attrs.type),
      title: attrs.title ?? 'Untitled artifact',
      language: attrs.language,
      content: body.replace(/^\n+/, '').replace(/\n+$/, ''),
    });
    return '';
  });

  // Fallback: promote large fenced blocks to artifacts when none are tagged.
  if (artifacts.length === 0) {
    const fenceRe = /```(html|svg|mermaid)\n([\s\S]*?)```/gi;
    const stripped2 = stripped.replace(fenceRe, (full, lang: string, body: string) => {
      if (body.trim().length < 300) return full;
      artifacts.push({
        id: uid(),
        type: normalizeType(lang),
        title: lang.toUpperCase() + ' artifact',
        content: body.trim(),
      });
      return '';
    });
    return { artifacts, stripped: stripped2.replace(/\n{3,}/g, '\n\n').trim() };
  }

  return { artifacts, stripped: stripped.replace(/\n{3,}/g, '\n\n').trim() };
}

/**
 * Renderable text while streaming: remove finished artifact blocks and hide a
 * trailing, still-open artifact block so raw tags never flash in the UI.
 */
export function renderableText(text: string): string {
  let out = text.replace(ARTIFACT_RE, '');
  const openIdx = out.search(OPEN_TAG_RE);
  if (openIdx !== -1) out = out.slice(0, openIdx);
  return out.replace(/\n{3,}/g, '\n\n');
}

export function isArtifactStreaming(text: string): boolean {
  return OPEN_TAG_RE.test(text.replace(ARTIFACT_RE, ''));
}
