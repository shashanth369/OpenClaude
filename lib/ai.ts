import { providerById, STATIC_MODELS } from './providers';
import type { ProviderId } from './types';
import type { StoredKeyMap } from './types';

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Server env key wins; a client-supplied (BYOK) key is the fallback. */
export function resolveApiKey(
  provider: ProviderId,
  clientKeys?: StoredKeyMap | null
): string | null {
  const info = providerById(provider);
  const env = process.env[info.envKey];
  if (env && env.trim()) return env.trim();
  const fromClient = clientKeys?.[provider];
  if (fromClient && fromClient.trim()) return fromClient.trim();
  if (!info.keyRequired) return ''; // airforce allows anonymous access
  return null;
}

export function providerConfigured(provider: ProviderId): boolean {
  const info = providerById(provider);
  const env = process.env[info.envKey];
  if (env && env.trim()) return true;
  return !info.keyRequired;
}

function buildHeaders(provider: ProviderId, key: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] =
      process.env.NEXT_PUBLIC_APP_URL || 'https://github.com/shashanth369/OpenClaude';
    headers['X-Title'] = 'OpenClaude';
  }
  return headers;
}

async function upstreamError(res: Response): Promise<string> {
  let detail = '';
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      detail =
        json?.error?.message ?? json?.message ?? json?.error?.metadata?.raw ?? text;
    } catch {
      detail = text;
    }
  } catch {
    detail = res.statusText;
  }
  return `${res.status}: ${String(detail).slice(0, 500)}`;
}

export interface StreamCallOptions {
  provider: ProviderId;
  model: string;
  messages: ChatCompletionMessage[];
  clientKeys?: StoredKeyMap | null;
  temperature?: number;
  maxTokens?: number;
}

/** Streaming call — returns the raw upstream Response (SSE body). */
export async function streamChatCompletion(opts: StreamCallOptions): Promise<Response> {
  const info = providerById(opts.provider);
  const key = resolveApiKey(opts.provider, opts.clientKeys);
  if (key === null) {
    return new Response(
      JSON.stringify({
        error: `${info.label} is not configured. Add ${info.envKey} on the server (or your own key in Settings → Provider keys).`,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const res = await fetch(info.chatEndpoint, {
    method: 'POST',
    headers: buildHeaders(opts.provider, key),
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      stream: true,
    }),
  });
  if (!res.ok) {
    const message = await upstreamError(res);
    return new Response(JSON.stringify({ error: `${info.label} rejected the request — ${message}` }), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return res;
}

/** Non-streaming call — returns the assistant message text. */
export async function chatCompletion(opts: StreamCallOptions): Promise<string> {
  const info = providerById(opts.provider);
  const key = resolveApiKey(opts.provider, opts.clientKeys);
  if (key === null) {
    throw new Error(
      `${info.label} is not configured. Add ${info.envKey} on the server (or your own key in Settings).`
    );
  }
  const res = await fetch(info.chatEndpoint, {
    method: 'POST',
    headers: buildHeaders(opts.provider, key),
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      stream: false,
    }),
  });
  if (!res.ok) {
    const message = await upstreamError(res);
    throw new Error(`${info.label} rejected the request — ${message}`);
  }
  const json = await res.json();
  const content: unknown =
    json?.choices?.[0]?.message?.content ??
    json?.choices?.[0]?.message?.reasoning_content ??
    '';
  return typeof content === 'string' ? content : JSON.stringify(content);
}

/** List available free-ish models for a provider (best effort, 6s timeout). */
export async function listModels(
  provider: ProviderId,
  clientKeys?: StoredKeyMap | null
): Promise<{ models: string[]; configured: boolean; live: boolean }> {
  const info = providerById(provider);
  const key = resolveApiKey(provider, clientKeys);
  const configured = key !== null;
  const fallback = { models: STATIC_MODELS[provider] ?? [], configured, live: false };
  if (!info.modelsEndpoint) return fallback;
  if (info.keyRequired && !key) return { ...fallback, configured: false };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = `Bearer ${key}`;
    const res = await fetch(info.modelsEndpoint, { headers, signal: ctrl.signal });
    if (!res.ok) return fallback;
    const json = await res.json();

    let models: string[] = [];
    if (provider === 'gemini') {
      const list: any[] = json?.models ?? [];
      models = list
        .filter((m) => (m?.supportedGenerationMethods ?? []).includes('generateContent'))
        .map((m) => String(m?.name ?? '').replace(/^models\//, ''))
        .filter((m) => m.startsWith('gemini'));
    } else if (provider === 'openrouter') {
      const list: any[] = json?.data ?? [];
      models = list
        .filter((m) => {
          const p = m?.pricing ?? {};
          const prompt = parseFloat(p.prompt ?? '1');
          const completion = parseFloat(p.completion ?? '1');
          return prompt === 0 && completion === 0;
        })
        .map((m) => String(m?.id ?? ''))
        .filter(Boolean);
    } else {
      const list: any[] = json?.data ?? [];
      models = list
        .map((m) => String(m?.id ?? ''))
        .filter(Boolean)
        .filter((m) => !/whisper|tts|embed|guard|moderation|playai/i.test(m));
    }
    if (!models.length) return fallback;
    return { models: models.slice(0, 80), configured: true, live: true };
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}
