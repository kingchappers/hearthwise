// The query client for the person who is signed in on this device, with their saved cache. The mutations are registered when the
// client is made, before anything is restored: a restored write needs its function to be sent. The function that sends them (it
// needs the person's token) is plugged in later, by RegisterMutations, through the runtime.
import { createContext, useContext, useMemo, useState, useSyncExternalStore } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { recordDropped } from './dropped';
import { registerMutations } from './mutations';
import { dataForMutation } from './pending';
import {
  CACHE_SCHEMA_VERSION, createUserPersister, readStoredUser, shouldDehydrateMutation, subscribeStoredUser,
} from './persistedCache';
import type { AsyncStorageLike } from './persistedCache';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

type Request = (endpoint: string, options?: RequestInit) => Promise<unknown>;

export interface HouseholdRuntime {
  // Plugged in by the signed-in tree. Until then a write that tries to send fails as a network error and is retried.
  request?: Request;
  seal: () => void;
}

export interface HouseholdClient {
  client: QueryClient;
  runtime: HouseholdRuntime;
}

export function createHouseholdClient(userId: string | undefined): HouseholdClient {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } });
  const runtime: HouseholdRuntime = { seal: () => undefined };
  registerMutations(
    client,
    (endpoint, options) => (runtime.request ? runtime.request(endpoint, options) : Promise.reject(new TypeError('The app is not ready to send yet'))),
    except => dataForMutation(client, except),
    (message, options) => recordDropped({ id: crypto.randomUUID(), message, ask: options?.ask }),
    userId === undefined ? undefined : { ownerId: userId, currentUserId: readStoredUser },
  );
  return { client, runtime };
}

export interface RuntimeValue {
  runtime: HouseholdRuntime;
  // The saved cache has been restored (always true when there is none).
  restored: boolean;
  cacheUserId: string | undefined;
}

const NONE: RuntimeValue = { runtime: { seal: () => undefined }, restored: false, cacheUserId: undefined };
const RuntimeContext = createContext<RuntimeValue>(NONE);

export const useHouseholdRuntime = (): RuntimeValue => useContext(RuntimeContext);

function ProviderFor({ userId, storage, children }: { userId: string | undefined; storage?: AsyncStorageLike; children: React.ReactNode }) {
  const holder = useMemo(() => createHouseholdClient(userId), [userId]);
  const saved = useMemo(() => (userId === undefined ? undefined : createUserPersister(userId, storage)), [userId, storage]);
  const [restored, setRestored] = useState(false);
  const value = useMemo<RuntimeValue>(() => ({
    runtime: Object.assign(holder.runtime, { seal: saved?.seal ?? (() => undefined) }),
    restored,
    cacheUserId: userId,
  }), [holder, saved, restored, userId]);
  const dehydrateOptions = useMemo(() => ({ shouldDehydrateMutation }), []);

  if (!saved) {
    return (
      <QueryClientProvider client={holder.client}>
        <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
      </QueryClientProvider>
    );
  }
  return (
    <PersistQueryClientProvider
      client={holder.client}
      persistOptions={{ persister: saved.persister, maxAge: SEVEN_DAYS_MS, buster: String(CACHE_SCHEMA_VERSION), dehydrateOptions }}
      onSuccess={() => {
        setRestored(true);
        // Whatever was saved may be out of date: the lists are fetched again.
        void holder.client.invalidateQueries();
      }}
    >
      <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
    </PersistQueryClientProvider>
  );
}

// Keyed by the stored person: a different person signing in gets a new client and their own cache, never the previous person's.
export function HouseholdProvider({ children, storage }: { children: React.ReactNode; storage?: AsyncStorageLike }) {
  const userId = useSyncExternalStore(subscribeStoredUser, readStoredUser, () => undefined);
  return <ProviderFor key={userId ?? 'none'} userId={userId} storage={storage}>{children}</ProviderFor>;
}
