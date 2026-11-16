import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNow } from '../useNow';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse('2026-11-16T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('useNow', () => {
  it('gives the time now, and the time again a minute later', () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toBe(Date.parse('2026-11-16T10:00:00Z'));
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current).toBe(Date.parse('2026-11-16T10:01:00Z'));
  });

  it('stops ticking when the page goes away', () => {
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useNow());
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});
