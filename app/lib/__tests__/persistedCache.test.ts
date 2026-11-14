import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver, QueryClient, onlineManager } from '@tanstack/react-query';
import { persistQueryClientRestore, persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { ApiError } from '../apiError';
import { itemMutationKeys, mutationKeys, registerMutations } from '../mutations';
import {
  CACHE_SCHEMA_VERSION, cacheKey, clearStoredUser, createUserPersister, pendingWriteCount, readStoredUser, resumeHydratedMutations,
  resetSigningOutForTests, shouldDehydrateMutation, signOutCleanup, storeUser,
} from '../persistedCache';
import type { AsyncStorageLike } from '../persistedCache';

const ME = 'auth0|a';
const THEM = 'auth0|b';
const EMPTY = { tasks: [], proposals: [], serverTime: 0 };

class MemoryStorage implements AsyncStorageLike {
  readonly map = new Map<string, string>();
  async getItem(key: string): Promise<string | null> { return this.map.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> { this.map.set(key, value); }
  async removeItem(key: string): Promise<void> { this.map.delete(key); }
}

let storage: MemoryStorage;
let sent: { path: string; method: string; body: Record<string, unknown> }[];

// One "page": a client with the household mutations registered against a request that records what it is asked to send.
function newClient(ownerId = ME, currentUser: () => string | undefined = () => ownerId): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const request = vi.fn(async (path: string, init?: RequestInit) => {
    sent.push({ path, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : {} });
    return {};
  });
  registerMutations(client, request as never, () => ({ ...EMPTY }), vi.fn(), { ownerId, currentUserId: currentUser });
  return client;
}

const dehydrateOptions = { shouldDehydrateMutation };
const save = (client: QueryClient, userId = ME) => persistQueryClientSave({ queryClient: client, persister: createUserPersister(userId, storage).persister, buster: String(CACHE_SCHEMA_VERSION), dehydrateOptions });
const restore = async (client: QueryClient, userId = ME) =>
  persistQueryClientRestore({ queryClient: client, persister: createUserPersister(userId, storage).persister, buster: String(CACHE_SCHEMA_VERSION), maxAge: 7 * 86_400_000 });
const mutate = (client: QueryClient, key: readonly string[], variables: object) =>
  new MutationObserver(client, { mutationKey: key }).mutate({ at: 1, by: ME, ...variables } as never).catch(() => undefined);

beforeEach(() => {
  storage = new MemoryStorage();
  sent = [];
  window.localStorage.clear();
  resetSigningOutForTests();
  onlineManager.setOnline(true);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { onlineManager.setOnline(true); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('the stored user', () => {
  it('is kept and read back, and can be cleared', () => {
    expect(readStoredUser()).toBeUndefined();
    storeUser(ME);
    expect(readStoredUser()).toBe(ME);
    clearStoredUser();
    expect(readStoredUser()).toBeUndefined();
  });

  it('reads as nothing, and never throws, when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readStoredUser()).toBeUndefined();
    expect(() => storeUser(ME)).not.toThrow();
  });

  it('has a cache key of its own for each person', () => {
    expect(cacheKey(ME)).toBe('hearthwise-cache-auth0|a');
    expect(cacheKey(ME)).not.toBe(cacheKey(THEM));
  });
});

describe('writes made offline, across a reload', () => {
  it('are kept paused, saved, restored into a new page and sent in order', async () => {
    onlineManager.setOnline(false);
    const before = newClient();
    void mutate(before, mutationKeys.create, { mutationId: 'm1', task: { id: 't1', title: 'Bins', assignee: 'either', repeat: { type: 'none' } } });
    void mutate(before, mutationKeys.delete, { mutationId: 'm2', taskId: 't1' });
    await vi.waitFor(() => expect(pendingWriteCount(before)).toBe(2));
    await save(before);
    expect(sent).toEqual([]);

    // The reload: a new client, restored from what was saved, back online and signed in.
    onlineManager.setOnline(true);
    const after = newClient();
    await restore(after);
    expect(pendingWriteCount(after)).toBe(2);
    resumeHydratedMutations(after);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent.map(request => `${request.method} ${request.path}`)).toEqual(['POST /api/hh/tasks', 'DELETE /api/hh/tasks/t1']);
    await vi.waitFor(() => expect(pendingWriteCount(after)).toBe(0));
  });

  it('keep a write that was in the middle of a retry backoff, and save it after the reload', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const before = newClient();
    let attempts = 0;
    before.setMutationDefaults(itemMutationKeys.itemTick, { ...before.getMutationDefaults(itemMutationKeys.itemTick), mutationFn: async () => { attempts += 1; throw new TypeError('Failed to fetch'); } });
    void mutate(before, itemMutationKeys.itemTick, { mutationId: 'm1', itemId: 'i1', done: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(attempts).toBe(1);
    expect(pendingWriteCount(before)).toBe(1);
    await save(before);

    const after = newClient();
    await restore(after);
    resumeHydratedMutations(after);
    await vi.advanceTimersByTimeAsync(10);
    expect(sent.map(request => request.path)).toEqual(['/api/hh/items/i1']);
    await vi.waitFor(() => expect(pendingWriteCount(after)).toBe(0));
  });

  it('are not sent for a different person who has signed in on the same browser', async () => {
    onlineManager.setOnline(false);
    const before = newClient(ME);
    void mutate(before, mutationKeys.delete, { mutationId: 'm1', taskId: 't1' });
    await vi.waitFor(() => expect(pendingWriteCount(before)).toBe(1));
    await save(before);

    // The same cache is somehow in front of a client whose owner is someone else: the write is dropped, not sent.
    onlineManager.setOnline(true);
    const after = newClient(ME, () => THEM);
    await restore(after);
    resumeHydratedMutations(after);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(sent).toEqual([]);
  });
});

describe('what is restored', () => {
  it('never includes another person\'s entry: it is thrown away', async () => {
    onlineManager.setOnline(false);
    const a = newClient(ME);
    void mutate(a, mutationKeys.delete, { mutationId: 'm1', taskId: 't1' });
    await vi.waitFor(() => expect(pendingWriteCount(a)).toBe(1));
    await save(a, ME);
    // B's key now holds A's entry.
    storage.map.set(cacheKey(THEM), storage.map.get(cacheKey(ME))!);

    const b = newClient(THEM);
    await restore(b, THEM);
    expect(pendingWriteCount(b)).toBe(0);
    expect(storage.map.has(cacheKey(THEM))).toBe(false);
  });

  it('keeps the pending writes of an older version, and drops its query data to be fetched again', async () => {
    onlineManager.setOnline(false);
    const old = newClient();
    old.setQueryData(['tasks'], { tasks: [{ id: 'stale' }], proposals: [], serverTime: 1 });
    void mutate(old, mutationKeys.delete, { mutationId: 'm1', taskId: 't1' });
    await vi.waitFor(() => expect(pendingWriteCount(old)).toBe(1));
    await persistQueryClientSave({ queryClient: old, persister: createUserPersister(ME, storage).persister, buster: '0', dehydrateOptions });
    const entry = JSON.parse(storage.map.get(cacheKey(ME))!);
    entry.buster = '0';
    storage.map.set(cacheKey(ME), JSON.stringify(entry));

    onlineManager.setOnline(true);
    const fresh = newClient();
    await restore(fresh);
    expect(fresh.getQueryData(['tasks'])).toBeUndefined();
    expect(pendingWriteCount(fresh)).toBe(1);
    resumeHydratedMutations(fresh);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
  });

  it('dehydrates every pending household write, retrying or paused, and nothing else', () => {
    const client = newClient();
    onlineManager.setOnline(false);
    void mutate(client, mutationKeys.delete, { mutationId: 'm1', taskId: 't1' });
    const [pending] = client.getMutationCache().getAll();
    expect(shouldDehydrateMutation(pending)).toBe(true);
    const other = client.getMutationCache().build(client, { mutationKey: ['not-household'], mutationFn: async () => 1 });
    expect(shouldDehydrateMutation(other as never)).toBe(false);
  });
});

describe('signing out', () => {
  it('seals the saved cache, clears the writes and the stored user, and deletes the entry, so nothing comes back', async () => {
    const client = newClient();
    storeUser(ME);
    const { persister, seal } = createUserPersister(ME, storage);
    onlineManager.setOnline(false);
    void mutate(client, mutationKeys.delete, { mutationId: 'm1', taskId: 't1' });
    await vi.waitFor(() => expect(pendingWriteCount(client)).toBe(1));
    await persistQueryClientSave({ queryClient: client, persister, buster: String(CACHE_SCHEMA_VERSION), dehydrateOptions });
    expect(storage.map.has(cacheKey(ME))).toBe(true);

    await signOutCleanup({ client, userId: ME, seal, storage });
    // A save that was already under way when the person signed out lands after the delete, and is dropped.
    await persister.persistClient({ timestamp: Date.now(), buster: String(CACHE_SCHEMA_VERSION), clientState: { mutations: [], queries: [] } });
    expect(storage.map.has(cacheKey(ME))).toBe(false);
    expect(readStoredUser()).toBeUndefined();
    expect(pendingWriteCount(client)).toBe(0);
  });
});

describe('after signing out has begun', () => {
  it('does not store the person again, so a layout that is still mounted cannot undo the sign-out', async () => {
    const client = newClient();
    storeUser(ME);
    const { seal } = createUserPersister(ME, storage);
    await signOutCleanup({ client, userId: ME, seal, storage });
    storeUser(ME);
    expect(readStoredUser()).toBeUndefined();
  });
});

describe('signing out when the saved copy cannot be deleted', () => {
  it('still forgets who was signed in, and still reports the failure', async () => {
    const client = newClient();
    storeUser(ME);
    const failing: AsyncStorageLike = { getItem: async () => null, setItem: async () => undefined, removeItem: async () => { throw new Error('blocked'); } };
    const { seal } = createUserPersister(ME, failing);
    await expect(signOutCleanup({ client, userId: ME, seal, storage: failing })).rejects.toThrow('blocked');
    expect(readStoredUser()).toBeUndefined();
  });
});

describe('401 and the same person', () => {
  it('keeps a write after a 401 and sends it once the sign-in is renewed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let signedIn = false;
    const request = vi.fn(async () => { if (!signedIn) throw new ApiError(401, 'Unauthorized'); return {}; });
    registerMutations(client, request as never, () => ({ ...EMPTY }), vi.fn(), { ownerId: ME, currentUserId: () => ME });
    void mutate(client, mutationKeys.delete, { mutationId: 'm1', taskId: 't1' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(request.mock.calls.length).toBeGreaterThan(1);
    expect(pendingWriteCount(client)).toBe(1);
    signedIn = true;
    await vi.advanceTimersByTimeAsync(70_000);
    expect(pendingWriteCount(client)).toBe(0);
  });
});
