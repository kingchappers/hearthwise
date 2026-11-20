import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FeedShare } from '../../src/calendar/types';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { ApiError } from '~/lib/apiError';
import { IMPORTED_KEY } from '~/lib/calendarKeys';
import { feedFailureText } from '~/lib/calendarText';

export type FeedOutcome = { ok: true } | { ok: false; message: string };

export interface FeedActions {
  // The id is made once by the form, so a second tap is the same feed.
  add(input: { id: string; link: string; label: string; share: FeedShare }): Promise<FeedOutcome>;
  replace(id: string, link: string): Promise<FeedOutcome>;
  edit(id: string, changes: { label?: string; share?: FeedShare }): Promise<FeedOutcome>;
  refresh(id: string): Promise<FeedOutcome>;
  remove(id: string): Promise<FeedOutcome>;
}

// What the person is told: the words for the reason the server gave, and nothing else. An error is never shown as it came, because
// one that came from a fetch of the link could name it.
function messageFor(error: unknown): string {
  if (!(error instanceof ApiError)) return feedFailureText('');
  return feedFailureText(error.code === 'feed_failed' ? error.detail ?? '' : error.code ?? '');
}

// The feed actions. They need a signal and are never queued or saved: a link is a secret, and a saved write would keep it on the
// device. Each is one request, waited for; the person sees the answer, and the windows are read again after it.
export function useFeedActions(): FeedActions {
  const { request } = useProtectedApi();
  const client = useQueryClient();

  const send = useCallback(async (path: string, method: string, body: object): Promise<FeedOutcome> => {
    try {
      await request(path, { method, body: JSON.stringify(body) });
      await client.invalidateQueries({ queryKey: IMPORTED_KEY });
      return { ok: true };
    } catch (error) {
      return { ok: false, message: messageFor(error) };
    }
  }, [request, client]);

  const base = '/api/hh/calendar/feeds';
  const mutationId = (): string => crypto.randomUUID();
  return {
    add: input => send(base, 'POST', input),
    replace: (id, link) => send(`${base}/${encodeURIComponent(id)}/replace`, 'POST', { replaceId: mutationId(), link }),
    edit: (id, changes) => send(`${base}/${encodeURIComponent(id)}`, 'PATCH', { mutationId: mutationId(), ...changes }),
    refresh: id => send(`${base}/${encodeURIComponent(id)}/refresh`, 'POST', { mutationId: mutationId() }),
    remove: id => send(`${base}/${encodeURIComponent(id)}`, 'DELETE', { mutationId: mutationId() }),
  };
}
