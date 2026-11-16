import type { Artifact } from './types';

/** Normalize a React artifact into a self-contained document. */
export function reactToSrcDoc(source: string): string {
  let code = source;
  // strip imports (React UMD + Babel globals are provided)
  code = code.replace(/^\s*import[\s\S]*?from\s*['"][^'"]*['"];?\s*$/gm, '');
  code = code.replace(/^\s*import\s*['"][^'"]*['"];?\s*$/gm, '');

  let component = 'App';
  const fnMatch = code.match(/export\s+default\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/);
  const identMatch = code.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?/);
  if (fnMatch) component = fnMatch[1];
  else if (identMatch) component = identMatch[1];
  code = code.replace(/export\s+default\s+/g, '');

  // <script type="text/babel"> is raw text in HTML — never entity-escape it.
  // Only guard against the sequence that would terminate the script element early.
  code = code.replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script src="https://cdn.tailwindcss.com"></script>
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>html,body,#root{margin:0;min-height:100%;background:#ffffff;color:#111;font-family:ui-sans-serif,system-ui,sans-serif;}#oc-err{color:#b91c1c;font:12px/1.5 monospace;padding:12px;white-space:pre-wrap;display:none;}</style>
</head>
<body>
<div id="root"></div>
<pre id="oc-err"></pre>
<script>
  window.addEventListener('error', function (e) {
    var el = document.getElementById('oc-err');
    el.style.display = 'block';
    el.textContent = 'Runtime error: ' + (e.error && e.error.stack ? e.error.stack : e.message);
  });
</script>
<script type="text/babel" data-presets="react,typescript" id="oc-src">${code}
;(function () {
  try {
    var root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(${component}));
  } catch (err) {
    var el = document.getElementById('oc-err');
    el.style.display = 'block';
    el.textContent = 'Mount error: ' + (err && err.stack ? err.stack : String(err));
  }
})();
</script>
</body>
</html>`;
}

/** Build the full srcDoc for any previewable artifact type. */
export function artifactToSrcDoc(artifact: Artifact): string {
  const { type, content } = artifact;

  if (type === 'html') {
    return /<html[\s>]/i.test(content)
      ? content
      : `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;}</style></head><body>${content}</body></html>`;
  }
  if (type === 'svg') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;}svg{max-width:100%;max-height:100vh;}</style></head><body>${content}</body></html>`;
  }
  if (type === 'mermaid') {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script><style>body{margin:0;display:grid;place-items:center;min-height:100vh;background:#fff;font-family:sans-serif;}</style></head><body><div class="mermaid">${content.replace(/</g, '&lt;')}</div><script>mermaid.initialize({startOnLoad:true,theme:'default'});</script></body></html>`;
  }
  if (type === 'react') return reactToSrcDoc(content);
  // markdown & code have no iframe preview
  return `<!DOCTYPE html><html><body></body></html>`;
}

export function downloadArtifact(artifact: Artifact) {
  const extMap: Record<string, string> = {
    html: 'html', react: 'jsx', markdown: 'md', code: 'txt', svg: 'svg', mermaid: 'mmd',
  };
  const ext = artifact.type === 'code' && artifact.language ? artifact.language : extMap[artifact.type] ?? 'txt';
  const mime =
    artifact.type === 'html' ? 'text/html'
    : artifact.type === 'svg' ? 'image/svg+xml'
    : artifact.type === 'markdown' ? 'text/markdown'
    : 'text/plain';
  const blob = new Blob([artifact.content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'artifact'}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
