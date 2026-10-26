import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initial, load, save } from './storage';
import { begin, defaults } from './engine';
let stored: string | null;
beforeEach(() => {
  stored = null;
  vi.stubGlobal('localStorage', {
    getItem: () => stored,
    setItem: (_: string, value: string) => {
      stored = value;
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('Persisted session safety', () => {
  it('round-trips a paused run and its remaining duration', () => {
    const data = structuredClone(initial);
    data.snapshot.run = {
      ...begin('study', defaults, false, 1000),
      status: 'paused',
      remaining: 45000,
    };
    expect(save(data)).toBe(true);
    expect(load().snapshot.run).toEqual(data.snapshot.run);
  });
  it('recovers from corrupt JSON and rejects a zero-duration loop', () => {
    stored = '{broken';
    expect(load()).toEqual(initial);
    const data = structuredClone(initial);
    data.settings.sessions[0].seconds = 0;
    stored = JSON.stringify(data);
    expect(load()).toEqual(initial);
  });
  it('reports unavailable storage without throwing', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Denied');
      },
      setItem: () => {
        throw new Error('Quota exceeded');
      },
    });
    expect(load()).toEqual(initial);
    expect(save(initial)).toBe(false);
  });
});

it('imports legacy data without ever writing the legacy key', () => {
  const legacy = JSON.stringify(initial);
  const values = new Map([['lbd-focus-v1', legacy]]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  const data = load();
  data.settings.name = 'V2';
  expect(save(data)).toBe(true);
  expect(values.get('lbd-focus-v1')).toBe(legacy);
  expect(load().settings.name).toBe('V2');
});
