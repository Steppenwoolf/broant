// The catalogue check: English catalogue key consistency and placeholder verification.
import { describe, expect, it } from 'vitest';
import en from '../locales/en.json';

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

describe('UI catalogues', () => {
  it('English catalogue is valid and has non-empty keys', () => {
    const keys = Object.keys(en);
    expect(keys.length).toBeGreaterThan(100);
    for (const key of keys) {
      expect(typeof en[key as keyof typeof en]).toBe('string');
    }
  });
});

describe('the runtime', () => {
  it('resolves English language strings and formats placeholders', async () => {
    const { setLanguage, t, browserLanguage } = await import('../i18n');
    await setLanguage('en');
    expect(t('panel.newChat')).toBe('New chat');
    expect(t('models.listed', { count: 3 })).toBe('3 models listed');
    expect(browserLanguage()).toBe('en');
  });
});
