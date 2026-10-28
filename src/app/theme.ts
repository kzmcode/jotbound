import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'rn.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();

export function readThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    // ストレージが使えない環境では OS 設定に従う
  }
  return 'system';
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? systemTheme() : preference;
}

/** `<meta name="theme-color">` をテーマの背景色（--aura-bg）に合わせる */
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--aura-bg').trim();
  if (meta && bg) meta.setAttribute('content', bg);
}

export function applyThemePreference(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = preference;
  try {
    if (preference === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // 永続化できなくても現在の画面には反映する
  }
  syncThemeColor();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia?.(DARK_QUERY);
  const onChange = () => {
    syncThemeColor();
    listener();
  };
  media?.addEventListener('change', onChange);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener('change', onChange);
  };
}

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, readThemePreference, () => 'system' as const);
  const resolved = useSyncExternalStore(
    subscribe,
    () => resolveTheme(readThemePreference()),
    () => 'light' as const,
  );
  useEffect(syncThemeColor, [resolved]);
  const setPreference = useCallback((p: ThemePreference) => applyThemePreference(p), []);
  return { preference, resolved, setPreference };
}
