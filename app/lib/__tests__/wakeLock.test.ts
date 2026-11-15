import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWakeLock } from '../wakeLock';

interface Sentinel { released: boolean; release: ReturnType<typeof vi.fn> }
let sentinels: Sentinel[];
let request: ReturnType<typeof vi.fn>;

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  sentinels = [];
  request = vi.fn(async () => {
    const sentinel: Sentinel = { released: false, release: vi.fn(async () => { sentinel.released = true; }) };
    sentinels.push(sentinel);
    return sentinel;
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } });
  setVisibility('visible');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  vi.restoreAllMocks();
});

describe('useWakeLock', () => {
  it('asks for a screen wake lock, and lets it go when the page is left', async () => {
    const { unmount } = renderHook(() => useWakeLock());
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    await waitFor(() => expect(sentinels).toHaveLength(1));
    unmount();
    await waitFor(() => expect(sentinels[0].release).toHaveBeenCalled());
  });

  it('asks again when the page is shown after being hidden, because browsers release the lock', async () => {
    renderHook(() => useWakeLock());
    await waitFor(() => expect(sentinels).toHaveLength(1));
    sentinels[0].released = true;
    setVisibility('hidden');
    setVisibility('visible');
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('does not ask while the page is hidden, or again while it still holds a lock', async () => {
    setVisibility('hidden');
    renderHook(() => useWakeLock());
    expect(request).not.toHaveBeenCalled();
    setVisibility('visible');
    await waitFor(() => expect(sentinels).toHaveLength(1));
    setVisibility('visible');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('does nothing where wake locks are not supported', () => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    expect(() => renderHook(() => useWakeLock())).not.toThrow();
  });

  it('carries on when the request is refused', async () => {
    request.mockRejectedValueOnce(new Error('NotAllowedError'));
    expect(() => renderHook(() => useWakeLock())).not.toThrow();
    await waitFor(() => expect(console.error).toHaveBeenCalled());
  });

  it('lets go of a lock that arrives after the page was already left', async () => {
    let arrive!: (sentinel: Sentinel) => void;
    request.mockImplementationOnce(() => new Promise<Sentinel>(resolve => { arrive = resolve; }));
    const { unmount } = renderHook(() => useWakeLock());
    unmount();
    const late: Sentinel = { released: false, release: vi.fn(async () => undefined) };
    arrive(late);
    await waitFor(() => expect(late.release).toHaveBeenCalled());
  });
});
