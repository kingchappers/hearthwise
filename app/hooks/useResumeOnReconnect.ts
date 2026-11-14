import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { resumeHydratedMutations } from '~/lib/persistedCache';

export interface ResumeOptions {
  // The saved cache has been restored into the client.
  restored: boolean;
  // Who is signed in now (undefined until sign-in has finished), and whose cache this is.
  signedInUserId: string | undefined;
  cacheUserId: string | undefined;
}

// Sends the waiting writes: the restored ones once, when the cache is restored and the person it belongs to is signed in; the paused
// ones whenever the connection returns or the app regains focus. A different person signed in never sends anyone else's.
export function useResumeOnReconnect({ restored, signedInUserId, cacheUserId }: ResumeOptions): void {
  const client = useQueryClient();
  const mine = signedInUserId !== undefined && signedInUserId === cacheUserId;
  const sentRestored = useRef(false);

  useEffect(() => {
    if (!restored || !mine || sentRestored.current) return;
    sentRestored.current = true;
    resumeHydratedMutations(client);
  }, [restored, mine, client]);

  useEffect(() => {
    if (!restored || !mine) return;
    const again = (): void => { void client.resumePausedMutations(); };
    window.addEventListener('online', again);
    window.addEventListener('focus', again);
    return () => {
      window.removeEventListener('online', again);
      window.removeEventListener('focus', again);
    };
  }, [restored, mine, client]);
}
