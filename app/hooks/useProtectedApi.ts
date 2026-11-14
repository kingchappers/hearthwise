import { useAuth } from '~/lib/auth';
import { useCallback } from 'react';
import { withTimeout } from '~/lib/api';
import { ApiError } from '~/lib/apiError';
import { expireLocalSession } from '~/lib/localAuth';
import { isSessionEndedError, markSessionEnded } from '~/lib/session';

// The `error` code (and `canMove`) in a JSON error body, if there is one. A body that is missing or not JSON gives neither.
async function readErrorBody(response: Response): Promise<{ code?: string; canMove?: boolean }> {
  try {
    const body = JSON.parse(await response.text()) as { error?: unknown; canMove?: unknown };
    return {
      code: typeof body.error === 'string' ? body.error : undefined,
      canMove: typeof body.canMove === 'boolean' ? body.canMove : undefined,
    };
  } catch {
    return {};
  }
}

export function useProtectedApi() {
  const { getToken, mode } = useAuth();

  const request = useCallback(
    async (endpoint: string, options: RequestInit = {}) => {
      try {
        const token = await getToken();

        const response = await fetch(endpoint, withTimeout({
          ...options,
          headers: {
            ...options.headers,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'Content-Type': 'application/json',
          },
        }));

        if (!response.ok) {
          const { code, canMove } = await readErrorBody(response);
          throw new ApiError(response.status, response.statusText, code, { canMove });
        }

        if (response.status === 204) return null;
        const text = await response.text();
        return text ? JSON.parse(text) : null;
      } catch (error) {
        console.error('Protected API request failed:', error);
        if (isSessionEndedError(error)) markSessionEnded();
        // In local mode a 401 means the server no longer knows this session (expired, or reset from the CLI).
        if (mode === 'local' && error instanceof ApiError && error.status === 401) {
          expireLocalSession();
          markSessionEnded();
        }
        throw error;
      }
    },
    [getToken, mode]
  );

  return { request };
}
