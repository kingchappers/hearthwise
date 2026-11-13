type Request = (endpoint: string, options?: RequestInit) => Promise<unknown>;

// Every request ends after this long. On weak signal a fetch can hang with the browser still reporting online; a timeout lets
// a request fail, and be retried, instead of waiting for ever.
export const API_TIMEOUT_MS = 10_000;

// Adds the timeout to a request. A signal the caller already set still ends the request too.
export function withTimeout(init: RequestInit = {}): RequestInit {
  const timeout = AbortSignal.timeout(API_TIMEOUT_MS);
  return { ...init, signal: init.signal ? AbortSignal.any([init.signal, timeout]) : timeout };
}

export function createApi(request: Request) {
  return {
    getHealth: async (): Promise<{ status: string }> => await request('/api/health') as { status: string },
  };
}

export type Api = ReturnType<typeof createApi>;
