import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_TIMEOUT_MS, createApi, withTimeout } from '../api';

// AbortSignal.timeout runs on timers that fake timers do not control, so it is replaced by one that does.
function fakeTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('The operation timed out.', 'TimeoutError')), ms);
  return controller.signal;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation(fakeTimeoutSignal);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('withTimeout', () => {
  it('gives a request a signal that fires after ten seconds', () => {
    expect(API_TIMEOUT_MS).toBe(10_000);
    const { signal } = withTimeout();
    vi.advanceTimersByTime(9_999);
    expect(signal?.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(signal?.aborted).toBe(true);
    expect((signal?.reason as DOMException).name).toBe('TimeoutError');
  });

  it('keeps the rest of the request as it was', () => {
    const init = withTimeout({ method: 'POST', body: '{}', headers: { 'X-A': '1' } });
    expect(init).toMatchObject({ method: 'POST', body: '{}', headers: { 'X-A': '1' } });
  });

  it("still ends the request when the caller's own signal aborts first", () => {
    const own = new AbortController();
    const { signal } = withTimeout({ signal: own.signal });
    own.abort(new Error('caller gave up'));
    expect(signal?.aborted).toBe(true);
  });

  it('rejects a request that never answers with a TimeoutError after ten seconds', async () => {
    const hung = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });
    const attempt = hung('/api/health', withTimeout());
    const outcome = attempt.then(() => 'answered', (error: DOMException) => error.name);
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS);
    await expect(outcome).resolves.toBe('TimeoutError');
  });
});

describe('createApi', () => {
  it('asks the health route for its status', async () => {
    const request = vi.fn().mockResolvedValue({ status: 'ok' });
    await expect(createApi(request).getHealth()).resolves.toEqual({ status: 'ok' });
    expect(request).toHaveBeenCalledWith('/api/health');
  });
});
