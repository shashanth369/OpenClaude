import type { ProviderId } from './types';

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  envKey: string;
  baseUrl: string;
  chatEndpoint: string;
  /** OpenAI-compatible /models endpoint, if the provider has one */
  modelsEndpoint: string | null;
  keyRequired: boolean;
  keyHelpUrl: string;
  tagline: string;
  accent: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openrouter',
    label: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatEndpoint: 'https://openrouter.ai/api/v1/chat/completions',
    modelsEndpoint: 'https://openrouter.ai/api/v1/models',
    keyRequired: true,
    keyHelpUrl: 'https://openrouter.ai/keys',
    tagline: '400+ models, hundreds of them free',
    accent: '#8b5cf6',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    chatEndpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    modelsEndpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
    keyRequired: true,
    keyHelpUrl: 'https://aistudio.google.com/apikey',
    tagline: 'Gemini 2.5 Pro / Flash, free tier',
    accent: '#4285f4',
  },
  {
    id: 'groq',
    label: 'Groq',
    envKey: 'GROQ_API_KEY',
    baseUrl: 'https://api.groq.com/openai/v1',
    chatEndpoint: 'https://api.groq.com/openai/v1/chat/completions',
    modelsEndpoint: 'https://api.groq.com/openai/v1/models',
    keyRequired: true,
    keyHelpUrl: 'https://console.groq.com/keys',
    tagline: 'Blazing-fast open models, free tier',
    accent: '#f97316',
  },
  {
    id: 'airforce',
    label: 'Airforce',
    envKey: 'AIRFORCE_API_KEY',
    baseUrl: 'https://api.airforce/v1',
    chatEndpoint: 'https://api.airforce/v1/chat/completions',
    modelsEndpoint: 'https://api.airforce/v1/models',
    keyRequired: false,
    keyHelpUrl: 'https://api.airforce',
    tagline: 'Free models, no key required',
    accent: '#10b981',
  },
];

export const providerById = (id: string | null | undefined): ProviderInfo =>
  PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

/** Curated free model catalog — used as fallback when live listing fails. */
export const STATIC_MODELS: Record<ProviderId, string[]> = {
  openrouter: [
    'meta-llama/llama-3.3-70b-instruct:free',
    'deepseek/deepseek-chat-v3-0324:free',
    'deepseek/deepseek-r1:free',
    'qwen/qwen3-235b-a22b:free',
    'qwen/qwen3-32b:free',
    'google/gemini-2.0-flash-exp:free',
    'google/gemma-3-27b-it:free',
    'mistralai/mistral-small-3.2-24b-instruct:free',
    'openai/gpt-oss-120b:free',
    'openai/gpt-oss-20b:free',
    'meta-llama/llama-4-maverick:free',
    'meta-llama/llama-4-scout:free',
  ],
  gemini: [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'deepseek-r1-distill-llama-70b',
    'qwen-qwq-32b',
    'llama-4-scout-17b-16e-instruct',
    'gemma2-9b-it',
  ],
  airforce: [
    'gpt-4o-mini',
    'gpt-4o',
    'llama-3.3-70b',
    'deepseek-chat',
    'claude-3-5-haiku',
    'gemini-2.0-flash',
  ],
};

/** Friendly display name for a raw model id. */
export function prettyModelName(model: string): string {
  const base = model.split('/').pop() ?? model;
  return base
    .replace(/:free$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export const DEFAULT_MODEL = 'openrouter||meta-llama/llama-3.3-70b-instruct:free';

export function encodeModelChoice(provider: ProviderId, model: string) {
  return `${provider}||${model}`;
}

export function decodeModelChoice(choice: string | null | undefined): {
  provider: ProviderId;
  model: string;
} {
  if (!choice) {
    const [p, m] = DEFAULT_MODEL.split('||');
    return { provider: p as ProviderId, model: m };
  }
  const idx = choice.indexOf('||');
  if (idx === -1) return { provider: 'openrouter', model: choice };
  return {
    provider: choice.slice(0, idx) as ProviderId,
    model: choice.slice(idx + 2),
  };
}
