import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MutationObserver, onlineManager, useQueryClient } from '@tanstack/react-query';
import { HouseholdProvider, useHouseholdRuntime } from '../householdRuntime';
import { mutationKeys } from '../mutations';
import { CACHE_SCHEMA_VERSION, cacheKey, clearStoredUser, createUserPersister, pendingWriteCount, shouldDehydrateMutation, storeUser } from '../persistedCache';
import type { AsyncStorageLike } from '../persistedCache';
import { persistQueryClientSave } from '@tanstack/react-query-persist-client';
import { createHouseholdClient } from '../householdRuntime';

class MemoryStorage implements AsyncStorageLike {
  readonly map = new Map<string, string>();
  async getItem(key: string): Promise<string | null> { return this.map.get(key) ?? null; }
  async setItem(key: string, value: string): Promise<void> { this.map.set(key, value); }
  async removeItem(key: string): Promise<void> { this.map.delete(key); }
}

let storage: MemoryStorage;

function Probe() {
  const client = useQueryClient();
  const { restored, cacheUserId } = useHouseholdRuntime();
  return <p data-testid="probe">{`${restored ? 'restored' : 'restoring'}|${cacheUserId ?? 'none'}|${pendingWriteCount(client)}`}</p>;
}

// A saved entry for a person, with one write waiting.
async function savedEntryFor(userId: string): Promise<void> {
  onlineManager.setOnline(false);
  const { client } = createHouseholdClient(userId);
  new MutationObserver(client, { mutationKey: mutationKeys.delete }).mutate({ mutationId: 'm1', at: 1, by: userId, taskId: 't1' } as never).catch(() => undefined);
  await vi.waitFor(() => expect(pendingWriteCount(client)).toBe(1));
  await persistQueryClientSave({ queryClient: client, persister: createUserPersister(userId, storage).persister, buster: String(CACHE_SCHEMA_VERSION), dehydrateOptions: { shouldDehydrateMutation } });
  onlineManager.setOnline(true);
}

beforeEach(() => {
  storage = new MemoryStorage();
  window.localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { onlineManager.setOnline(true); clearStoredUser(); vi.restoreAllMocks(); });

describe('HouseholdProvider', () => {
  it('renders its children with no saved cache when nobody has signed in on this device', () => {
    render(<HouseholdProvider storage={storage}><Probe /></HouseholdProvider>);
    expect(screen.getByTestId('probe')).toHaveTextContent('restoring|none|0');
  });

  it('opens the stored person\'s cache at launch, with their waiting writes in it', async () => {
    await savedEntryFor('auth0|a');
    storeUser('auth0|a');
    render(<HouseholdProvider storage={storage}><Probe /></HouseholdProvider>);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('restored|auth0|a|1'));
  });

  it('never opens one person\'s cache for another who signs in', async () => {
    await savedEntryFor('auth0|a');
    storeUser('auth0|b');
    render(<HouseholdProvider storage={storage}><Probe /></HouseholdProvider>);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('restored|auth0|b|0'));
    expect(storage.map.has(cacheKey('auth0|a'))).toBe(true);
  });

  it('switches to the new person\'s cache when the stored person changes', async () => {
    await savedEntryFor('auth0|a');
    storeUser('auth0|a');
    render(<HouseholdProvider storage={storage}><Probe /></HouseholdProvider>);
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('restored|auth0|a|1'));
    act(() => storeUser('auth0|b'));
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('restored|auth0|b|0'));
  });
});
