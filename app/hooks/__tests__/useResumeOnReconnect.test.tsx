import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const resume = vi.hoisted(() => vi.fn());
vi.mock('~/lib/persistedCache', async importOriginal => ({ ...(await importOriginal<typeof import('~/lib/persistedCache')>()), resumeHydratedMutations: resume }));

import { useResumeOnReconnect } from '../useResumeOnReconnect';

let client: QueryClient;
let resumePaused: ReturnType<typeof vi.spyOn>;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

beforeEach(() => {
  client = new QueryClient();
  resumePaused = vi.spyOn(client, 'resumePausedMutations').mockResolvedValue(undefined as never);
  resume.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('useResumeOnReconnect', () => {
  it('sends the restored writes once the cache is restored and the same person is signed in', () => {
    renderHook(() => useResumeOnReconnect({ restored: true, signedInUserId: 'u1', cacheUserId: 'u1' }), { wrapper });
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('waits while the cache is not restored, nobody is signed in, or someone else is', () => {
    renderHook(() => useResumeOnReconnect({ restored: false, signedInUserId: 'u1', cacheUserId: 'u1' }), { wrapper });
    renderHook(() => useResumeOnReconnect({ restored: true, signedInUserId: undefined, cacheUserId: 'u1' }), { wrapper });
    renderHook(() => useResumeOnReconnect({ restored: true, signedInUserId: 'u2', cacheUserId: 'u1' }), { wrapper });
    expect(resume).not.toHaveBeenCalled();
  });

  it('sends them when the person signs in after the cache was restored, and only once', () => {
    const { rerender } = renderHook((props: { signedIn?: string }) => useResumeOnReconnect({ restored: true, signedInUserId: props.signedIn, cacheUserId: 'u1' }), { wrapper, initialProps: {} });
    expect(resume).not.toHaveBeenCalled();
    rerender({ signedIn: 'u1' });
    rerender({ signedIn: 'u1' });
    expect(resume).toHaveBeenCalledTimes(1);
  });

  it('resumes paused writes when the connection returns and when the app regains focus', () => {
    renderHook(() => useResumeOnReconnect({ restored: true, signedInUserId: 'u1', cacheUserId: 'u1' }), { wrapper });
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new Event('focus'));
    expect(resumePaused).toHaveBeenCalledTimes(2);
  });

  it('does not resume on reconnect for a different person', () => {
    renderHook(() => useResumeOnReconnect({ restored: true, signedInUserId: 'u2', cacheUserId: 'u1' }), { wrapper });
    window.dispatchEvent(new Event('online'));
    expect(resumePaused).not.toHaveBeenCalled();
  });

  it('stops listening when it is removed', () => {
    const { unmount } = renderHook(() => useResumeOnReconnect({ restored: true, signedInUserId: 'u1', cacheUserId: 'u1' }), { wrapper });
    unmount();
    window.dispatchEvent(new Event('online'));
    expect(resumePaused).not.toHaveBeenCalled();
  });
});
