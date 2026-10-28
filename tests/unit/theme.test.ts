import { describe, expect, it } from 'vitest';
import { applyThemePreference, readThemePreference, resolveTheme } from '../../src/app/theme';

describe('theme', () => {
  it('明示選択を data-theme と localStorage に反映する', () => {
    applyThemePreference('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(readThemePreference()).toBe('dark');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('system は data-theme を外し、保存値も消す', () => {
    applyThemePreference('light');
    applyThemePreference('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(readThemePreference()).toBe('system');
  });

  it('不正な保存値は system として扱う', () => {
    localStorage.setItem('rn.theme', 'sepia');
    expect(readThemePreference()).toBe('system');
  });
});
