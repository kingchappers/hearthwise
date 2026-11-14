// The saved copy of the person's lists and of every write that has not yet reached the server, kept in IndexedDB under a key of their
// own. Opened at launch before any network call, so the last-known lists and the waiting writes are there with no signal.
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Mutation, QueryClient } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';

// Raised when the shape of what is saved changes. An older entry keeps its waiting writes (they are replayed) and drops its lists.
export const CACHE_SCHEMA_VERSION = 1;
export const USER_KEY = 'hearthwise-user';

export const cacheKey = (userId: string): string => `hearthwise-cache-${userId}`;

export interface AsyncStorageLike {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<void> | void;
  removeItem(key: string): Promise<void> | void;
}

export function idbStorage(): AsyncStorageLike {
  return {
    getItem: async key => (await get<string>(key)) ?? null,
    setItem: (key, value) => set(key, value),
    removeItem: key => del(key),
  };
}

// Who was signed in last on this device, so the right cache can be opened before sign-in has finished.
export function readStoredUser(): string | undefined {
  try {
    return window.localStorage.getItem(USER_KEY) ?? undefined;
  } catch (error) {
    console.error('persistedCache: could not read the stored user', error);
    return undefined;
  }
}

const userListeners = new Set<() => void>();

// The app re-opens the right cache when the person changes.
export function subscribeStoredUser(listener: () => void): () => void {
  userListeners.add(listener);
  return () => userListeners.delete(listener);
}

export function storeUser(userId: string): void {
  try {
    if (window.localStorage.getItem(USER_KEY) === userId) return;
    window.localStorage.setItem(USER_KEY, userId);
  } catch (error) {
    console.error('persistedCache: could not keep the stored user', error);
  }
  userListeners.forEach(listener => listener());
}

export function clearStoredUser(): void {
  try {
    window.localStorage.removeItem(USER_KEY);
  } catch (error) {
    console.error('persistedCache: could not clear the stored user', error);
  }
  userListeners.forEach(listener => listener());
}

type Saved = PersistedClient & { userId?: string };

export interface UserPersister {
  persister: Persister;
  // Drops every later save. Sign-out calls this first: a save already under way would otherwise land after the delete and bring the
  // person's waiting writes back.
  seal: () => void;
}

export function createUserPersister(userId: string, storage: AsyncStorageLike = idbStorage()): UserPersister {
  const base = createAsyncStoragePersister({ storage, key: cacheKey(userId), throttleTime: 0 });
  const current = String(CACHE_SCHEMA_VERSION);
  let sealed = false;

  const persister: Persister = {
    persistClient: async client => {
      if (sealed) return;
      // Every entry says whose it is, so one that ends up under the wrong key is never opened for someone else.
      await base.persistClient({ ...client, buster: current, userId } as Saved);
    },
    restoreClient: async () => {
      const saved = await base.restoreClient() as Saved | undefined;
      if (!saved) return undefined;
      if (saved.userId !== userId) {
        await base.removeClient();
        return undefined;
      }
      // An entry from another version keeps its waiting writes and drops its lists, which are fetched again.
      if (saved.buster !== current) return { ...saved, buster: current, clientState: { ...saved.clientState, queries: [] } };
      return saved;
    },
    removeClient: () => base.removeClient(),
  };
  return { persister, seal: () => { sealed = true; } };
}

// Every pending household write is saved, whether it is waiting for the network or in the middle of a retry.
export function shouldDehydrateMutation(mutation: Mutation): boolean {
  return mutation.state.status === 'pending' && mutation.options.scope?.id === 'household';
}

export function pendingWriteCount(client: QueryClient): number {
  return client.getMutationCache().findAll({ mutationKey: ['household'], status: 'pending' }).length;
}

// A restored write has no running attempt. continue() starts it; the household scope makes the rest wait their turn, in order.
export function resumeHydratedMutations(client: QueryClient): void {
  for (const mutation of client.getMutationCache().getAll().filter(candidate => candidate.state.status === 'pending')) {
    void mutation.continue().catch(() => undefined);
  }
}

export async function clearUserCache(userId: string, storage: AsyncStorageLike = idbStorage()): Promise<void> {
  await storage.removeItem(cacheKey(userId));
}

// Everything a person leaves behind when they sign out: later saves are sealed off, the writes and lists are dropped from memory,
// the saved entry is deleted and the device forgets who it was.
export async function signOutCleanup(options: { client: QueryClient; userId: string; seal: () => void; storage?: AsyncStorageLike }): Promise<void> {
  options.seal();
  try {
    options.client.getMutationCache().clear();
    options.client.clear();
    await clearUserCache(options.userId, options.storage);
  } finally {
    // The device forgets who it was even if the saved entry could not be deleted, so it is never left treated as signed in. The failure
    // still reaches the caller, who tells the person.
    clearStoredUser();
  }
}
