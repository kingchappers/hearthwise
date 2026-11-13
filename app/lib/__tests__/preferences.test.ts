import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

type PreferencesModule = typeof import('../preferences');

let prefs: PreferencesModule;

function brokenStorage(): Storage {
  return {
    length: 0,
    clear: () => { throw new Error('denied'); },
    getItem: () => { throw new Error('denied'); },
    key: () => null,
    removeItem: () => { throw new Error('denied'); },
    setItem: () => { throw new Error('denied'); },
  };
}

beforeEach(async () => {
  window.localStorage.clear();
  vi.resetModules();
  prefs = await import('../preferences');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('what is kept on this device', () => {
  it('is only the text size, how long Undo messages stay, and reduced motion', () => {
    expect(Object.keys(prefs.DEFAULT_PREFERENCES).sort()).toEqual(['reduceMotion', 'textSize', 'undoDuration']);
  });

  it('is saved under the Hearthwise key', () => {
    expect(prefs.PREFERENCES_KEY).toBe('hearthwise.preferences');
  });

  it('never reads settings saved by another app', () => {
    window.localStorage.setItem('hoardwise.preferences', JSON.stringify({ textSize: 'largest' }));
    window.localStorage.setItem('budget.preferences', JSON.stringify({ textSize: 'largest' }));
    expect(prefs.readPreferences(window.localStorage)).toEqual(prefs.DEFAULT_PREFERENCES);
  });
});

describe('readPreferences', () => {
  it('returns the defaults when nothing is saved', () => {
    expect(prefs.readPreferences(window.localStorage)).toEqual(prefs.DEFAULT_PREFERENCES);
  });

  it('returns the defaults when storage is unavailable', () => {
    expect(prefs.readPreferences(null)).toEqual(prefs.DEFAULT_PREFERENCES);
  });

  it('reads back what was written', () => {
    const chosen = { textSize: 'large', undoDuration: '30s', reduceMotion: true } as const;
    prefs.writePreferences(window.localStorage, chosen);
    expect(prefs.readPreferences(window.localStorage)).toEqual(chosen);
  });

  it('ignores unreadable JSON and values of the wrong type', () => {
    window.localStorage.setItem(prefs.PREFERENCES_KEY, '{not json');
    expect(prefs.readPreferences(window.localStorage)).toEqual(prefs.DEFAULT_PREFERENCES);

    window.localStorage.setItem(prefs.PREFERENCES_KEY, JSON.stringify({ reduceMotion: 'yes', textSize: 'large', extra: 1 }));
    expect(prefs.readPreferences(window.localStorage)).toEqual({ ...prefs.DEFAULT_PREFERENCES, textSize: 'large' });
  });

  it('survives storage that throws', () => {
    expect(prefs.readPreferences(brokenStorage())).toEqual(prefs.DEFAULT_PREFERENCES);
    expect(prefs.writePreferences(brokenStorage(), prefs.DEFAULT_PREFERENCES)).toBe(false);
  });

  it('defaults to standard text and messages that stay until closed', () => {
    expect(prefs.DEFAULT_PREFERENCES.textSize).toBe('standard');
    expect(prefs.DEFAULT_PREFERENCES.undoDuration).toBe('until-closed');
  });

  it('keeps a valid text size and undo duration, and falls back for anything else', () => {
    window.localStorage.setItem(prefs.PREFERENCES_KEY, JSON.stringify({ textSize: 'largest', undoDuration: '10s' }));
    expect(prefs.readPreferences(window.localStorage)).toMatchObject({ textSize: 'largest', undoDuration: '10s' });

    window.localStorage.setItem(prefs.PREFERENCES_KEY, JSON.stringify({ textSize: 'huge', undoDuration: 5000 }));
    expect(prefs.readPreferences(window.localStorage)).toMatchObject({ textSize: 'standard', undoDuration: 'until-closed' });
  });

  it('keeps reduce motion off until it is turned on, and remembers it', () => {
    expect(prefs.DEFAULT_PREFERENCES.reduceMotion).toBe(false);
    prefs.writePreferences(window.localStorage, { ...prefs.DEFAULT_PREFERENCES, reduceMotion: true });
    expect(prefs.readPreferences(window.localStorage).reduceMotion).toBe(true);
  });
});

describe('usePreferences', () => {
  it('starts from the saved preferences', () => {
    prefs.writePreferences(window.localStorage, { ...prefs.DEFAULT_PREFERENCES, textSize: 'large' });
    const { result } = renderHook(() => prefs.usePreferences());
    expect(result.current[0].textSize).toBe('large');
  });

  it('updates every reader and persists the change', () => {
    const first = renderHook(() => prefs.usePreferences());
    const second = renderHook(() => prefs.usePreferences());

    act(() => first.result.current[1]({ reduceMotion: true }));

    expect(first.result.current[0].reduceMotion).toBe(true);
    expect(second.result.current[0].reduceMotion).toBe(true);
    expect(prefs.readPreferences(window.localStorage).reduceMotion).toBe(true);
  });

  it('keeps a change for this visit when storage cannot save it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    const { result } = renderHook(() => prefs.usePreferences());

    act(() => result.current[1]({ reduceMotion: true }));

    expect(result.current[0].reduceMotion).toBe(true);
    expect(console.error).toHaveBeenCalled();
  });

  it('follows changes made in another tab', () => {
    const { result } = renderHook(() => prefs.usePreferences());

    act(() => {
      window.localStorage.setItem(prefs.PREFERENCES_KEY, JSON.stringify({ reduceMotion: true }));
      window.dispatchEvent(new StorageEvent('storage', { key: prefs.PREFERENCES_KEY }));
    });

    expect(result.current[0].reduceMotion).toBe(true);
  });
});
