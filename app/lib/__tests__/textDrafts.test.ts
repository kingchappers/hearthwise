import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { clearDeviceKeys, textDraftsKey } from '../deviceKeys';
import { clearTextDraft, readTextDraft, useDraftText, writeTextDraft } from '../textDrafts';

beforeEach(() => window.localStorage.clear());

describe('text drafts', () => {
  it('keeps what a person typed, for that person only', () => {
    writeTextDraft('u1', 'k', 'Call the plumber about the');
    expect(readTextDraft('u1', 'k')).toBe('Call the plumber about the');
    expect(readTextDraft('u2', 'k')).toBeUndefined();
  });

  it('removes a draft when it is emptied or cleared, and keeps nothing without a user', () => {
    writeTextDraft('u1', 'k', 'x');
    writeTextDraft('u1', 'k', '');
    expect(readTextDraft('u1', 'k')).toBeUndefined();
    writeTextDraft('u1', 'k', 'y');
    clearTextDraft('u1', 'k');
    expect(readTextDraft('u1', 'k')).toBeUndefined();
    writeTextDraft('', 'k', 'z');
    expect(window.localStorage.getItem(textDraftsKey(''))).toBeNull();
  });

  it('forgets a draft after two weeks, and keeps at most 40, dropping the oldest', () => {
    writeTextDraft('u1', 'old', 'x', 1_000);
    expect(readTextDraft('u1', 'old', 1_000 + 15 * 86_400_000)).toBeUndefined();
    for (let i = 0; i < 45; i += 1) writeTextDraft('u1', `k${i}`, 'x', 10_000 + i);
    expect(readTextDraft('u1', 'k0', 10_100)).toBeUndefined();
    expect(readTextDraft('u1', 'k44', 10_100)).toBe('x');
  });

  it('is cleared at sign-out with the other device keys', () => {
    writeTextDraft('u1', 'k', 'x');
    clearDeviceKeys('u1');
    expect(window.localStorage.getItem(textDraftsKey('u1'))).toBeNull();
  });

  it('reads blocked or broken storage as no draft', () => {
    window.localStorage.setItem(textDraftsKey('u1'), '{nope');
    expect(readTextDraft('u1', 'k')).toBeUndefined();
  });
});

describe('useDraftText', () => {
  it('starts from the saved draft, saves each change, and forgets it when cleared', () => {
    writeTextDraft('u1', 'k', 'half typed');
    const first = renderHook(() => useDraftText('u1', 'k'));
    expect(first.result.current[0]).toBe('half typed');
    act(() => first.result.current[1]('half typed, and more'));
    expect(readTextDraft('u1', 'k')).toBe('half typed, and more');
    act(() => first.result.current[2]());
    expect(readTextDraft('u1', 'k')).toBeUndefined();
  });

  it('starts from the given text when there is no draft, and does not keep text that is just the starting text', () => {
    const { result } = renderHook(() => useDraftText('u1', 'k', 'Original'));
    expect(result.current[0]).toBe('Original');
    act(() => result.current[1]('Changed'));
    expect(readTextDraft('u1', 'k')).toBe('Changed');
    act(() => result.current[1]('Original'));
    expect(readTextDraft('u1', 'k')).toBeUndefined();
  });
});
