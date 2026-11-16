import type { StoredKeyMap } from './types';

const KEY = 'openclaude:keys';

export function getClientKeys(): StoredKeyMap {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function setClientKeys(keys: StoredKeyMap) {
  window.localStorage.setItem(KEY, JSON.stringify(keys));
}

export function clearClientKeys() {
  window.localStorage.removeItem(KEY);
}
