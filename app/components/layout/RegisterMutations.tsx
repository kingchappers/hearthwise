import { useEffect } from 'react';
import { useAuth } from '~/lib/auth';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { useResumeOnReconnect } from '~/hooks/useResumeOnReconnect';
import { useHouseholdRuntime } from '~/lib/householdRuntime';

// The household mutations are registered when the client is made (a restored write needs its function before anything is restored).
// What they need from the signed-in tree is the function that sends a request with the person's token: it is plugged in here, and
// the waiting writes are sent once the cache is restored and the person it belongs to is signed in. Renders nothing.
export function RegisterMutations() {
  const { request } = useProtectedApi();
  const { user } = useAuth();
  const { runtime, restored, cacheUserId } = useHouseholdRuntime();

  useEffect(() => {
    runtime.request = request;
    return () => { if (runtime.request === request) runtime.request = undefined; };
  }, [runtime, request]);

  useResumeOnReconnect({ restored, signedInUserId: user?.sub, cacheUserId });
  return null;
}
