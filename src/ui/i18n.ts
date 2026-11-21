// The UI's languages: JSON catalogues loaded at runtime, so the language can change without a reload, with typed keys
// taken from the English catalogue. A missing key falls back to English.
import { useSyncExternalStore } from 'react';
import en from './locales/en.json';

export type MessageKey = keyof typeof en;
export type Language = 'en';
type Catalogue = Partial<Record<MessageKey, string>>;

/** Catalogues other than English, loaded when chosen. */
export const LOADERS: Partial<Record<Language, () => Promise<{ default: Catalogue }>>> = {};

let language: Language = 'en';
let catalogue: Catalogue = en;
const listeners = new Set<() => void>();

/** The language for the "auto" setting: English. */
export function browserLanguage(tag: string = globalThis.navigator?.language ?? 'en'): Language {
  return 'en';
}

export function resolveLanguage(setting: string): Language {
  return 'en';
}

export async function setLanguage(setting: string): Promise<void> {
  language = 'en';
  catalogue = en;
  if (typeof document !== 'undefined') document.documentElement.lang = 'en';
  listeners.forEach(l => l());
}

export function currentLanguage(): Language {
  return language;
}

/** A string by key, with `{name}` placeholders filled from `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = catalogue[key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the component when the language changes. */
export function useLanguage(): Language {
  const current = () => language;
  return useSyncExternalStore(subscribe, current, current);
}
