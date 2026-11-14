// The offline spike: the smallest version of the step 5 setup that can prove it works in a real browser. It builds a persister, two
// registered mutations and the retry rule, and talks to a stub API the tests control. It does not use any app code.
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, useMutation, useMutationState, useQuery } from '@tanstack/react-query';
import type { Mutation } from '@tanstack/react-query';
import { PersistQueryClientProvider, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { del, get, set } from 'idb-keyval';

const USER_KEY = 'spike-user';
const TOKEN_KEY = 'spike-token';
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

class ApiError extends Error {
  constructor(readonly status: number) { super(`API ${status}`); }
}

const currentUser = (): string | null => localStorage.getItem(USER_KEY);
const token = (): string => localStorage.getItem(TOKEN_KEY) ?? '';

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new ApiError(response.status);
  return response.json();
}

// The step 5 retry rule: a network failure or a timeout is retried for ever; a 5xx three times; anything else is dropped.
function shouldRetry(count: number, error: unknown): boolean {
  if (error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError')) return true;
  if (error instanceof ApiError && error.status >= 500) return count < 3;
  return false;
}
const retryDelay = (count: number): number => Math.min(1000 * 2 ** count, 60_000);

// One client per signed-in person. Its mutations are bound to that person: if anyone else is signed in when one runs, it is dropped,
// never sent, so a write can never go out under another person's name.
function createClient(ownerId: string): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  for (const kind of ['add', 'rename'] as const) {
    client.setMutationDefaults(['household', kind], {
      scope: { id: 'household' },
      networkMode: 'online',
      retry: shouldRetry,
      retryDelay,
      mutationFn: async (variables: { id: string; text: string; mutationId: string }) => {
        if (currentUser() !== ownerId) throw new ApiError(403);
        return call(`/api/${kind}`, { method: 'POST', body: JSON.stringify(variables) });
      },
      onSettled: () => { void client.invalidateQueries({ queryKey: ['list'] }); },
    });
  }
  return client;
}

const shouldDehydrateMutation = (mutation: Mutation): boolean => mutation.state.status === 'pending' && mutation.options.scope?.id === 'household';

// Every pending mutation, retrying or paused, is run again in order. Hydrated ones have no retryer, so continue() executes them; the
// household scope makes the rest wait their turn.
function resumeAll(client: QueryClient): void {
  for (const mutation of client.getMutationCache().getAll().filter(m => m.state.status === 'pending')) void mutation.continue().catch(() => undefined);
}

function Screen({ client, ownerId, restored, onSignOut }: { client: QueryClient; ownerId: string; restored: boolean; onSignOut: () => Promise<void> }) {
  const [signedIn, setSignedIn] = useState(false);
  const [text, setText] = useState('milk');
  const list = useQuery({ queryKey: ['list'], queryFn: () => call('/api/list') as Promise<{ items: string[] }>, enabled: signedIn });
  const pending = useMutationState({ filters: { status: 'pending' } }).length;
  const adding = useMutation<unknown, Error, { id: string; text: string; mutationId: string }>({ mutationKey: ['household', 'add'] });

  // "Signing in": it works only if the stub accepts the token, so a cold launch with no signal or an expired token stays signed out.
  useEffect(() => {
    let cancelled = false;
    call('/api/whoami').then(
      who => { if (!cancelled && (who as { user: string }).user === ownerId) setSignedIn(true); },
      () => undefined,
    );
    return () => { cancelled = true; };
  }, [ownerId]);

  useEffect(() => {
    if (restored && signedIn) resumeAll(client);
  }, [restored, signedIn, client]);
  useEffect(() => {
    const again = (): void => { if (restored && signedIn) resumeAll(client); };
    window.addEventListener('online', again);
    window.addEventListener('focus', again);
    return () => { window.removeEventListener('online', again); window.removeEventListener('focus', again); };
  }, [restored, signedIn, client]);

  return (
    <div>
      <p data-testid="user">{ownerId}</p>
      <p data-testid="status">{signedIn ? 'signed in' : 'signing in'}</p>
      <p data-testid="pending-count">{pending}</p>
      <ul data-testid="saved-list">{(list.data?.items ?? []).map(item => <li key={item}>{item}</li>)}</ul>
      <input data-testid="text" value={text} onChange={event => setText(event.target.value)} />
      <button data-testid="add-button" onClick={() => adding.mutate({ id: crypto.randomUUID(), text, mutationId: crypto.randomUUID() })}>add</button>
      <button data-testid="sign-out" onClick={() => { void onSignOut(); }}>sign out</button>
    </div>
  );
}

function Provider({ userId }: { userId: string }) {
  const client = useMemo(() => createClient(userId), [userId]);
  // Sealing the persister drops every later write. Without it, a save already under way when the cache is deleted lands after the
  // delete and brings the person's waiting writes back.
  const sealed = useMemo(() => ({ value: false }), [userId]);
  const persister = useMemo(() => {
    const base = createAsyncStoragePersister({
      key: `spike-cache-${userId}`,
      throttleTime: 0,
      storage: { getItem: async key => (await get<string>(key)) ?? null, setItem: (key, value) => set(key, value), removeItem: key => del(key) },
    });
    return { ...base, persistClient: async (data: Parameters<typeof base.persistClient>[0]) => { if (!sealed.value) await base.persistClient(data); } };
  }, [userId, sealed]);
  const [restored, setRestored] = useState(false);
  const dehydrateOptions = useMemo(() => ({ shouldDehydrateMutation }), []);

  // Saved for good the moment the page is hidden or closed, as well as on every change.
  useEffect(() => {
    const save = (): void => { void persistQueryClientSave({ queryClient: client, persister, dehydrateOptions }); };
    document.addEventListener('visibilitychange', save);
    window.addEventListener('pagehide', save);
    return () => { document.removeEventListener('visibilitychange', save); window.removeEventListener('pagehide', save); };
  }, [client, persister, dehydrateOptions]);

  async function signOut(): Promise<void> {
    sealed.value = true;
    client.getMutationCache().clear();
    client.clear();
    await del(`spike-cache-${userId}`);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  }

  return (
    <PersistQueryClientProvider client={client} persistOptions={{ persister, maxAge: SEVEN_DAYS, dehydrateOptions }} onSuccess={() => setRestored(true)}>
      <Screen client={client} ownerId={userId} restored={restored} onSignOut={signOut} />
    </PersistQueryClientProvider>
  );
}

function Root() {
  const [user, setUser] = useState(currentUser());
  if (user) return <Provider key={user} userId={user} />;
  return (
    <div>
      {['a', 'b'].map(id => (
        <button key={id} data-testid={`sign-in-as-${id}`} onClick={() => { localStorage.setItem(USER_KEY, id); localStorage.setItem(TOKEN_KEY, `valid:${id}`); setUser(id); }}>
          sign in as {id}
        </button>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Root />);
