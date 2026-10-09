// Vitest setup: Angular JIT + TestBed environment, localStorage for jsdom.
import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

// ConfigProperty persists through localStorage. Some jsdom/Node combinations
// leave it undefined; provide an in-memory implementation then.
if (typeof (globalThis as { localStorage?: Storage }).localStorage === 'undefined') {
  const store = new Map<string, string>();
  const localStoragePolyfill = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: localStoragePolyfill, writable: true });
  Object.defineProperty(window, 'localStorage', { value: localStoragePolyfill, writable: true });
}
