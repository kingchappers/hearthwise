import { useMemo } from 'react';
import { useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ShoppingItem } from '../../src/shopping/types';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { applyPendingItems } from './itemOverlay';
import type { ItemsData } from './itemOverlay';
import type { PendingMutation } from './overlay';
import { currentSettledCount } from './queries';

export const ITEMS_KEY = ['items'] as const;

const POLL_MS = 10_000;

// Open items: what is still to buy first, then what is ticked, each by name. Deleted items are not shown.
export function sortItems(items: ShoppingItem[]): ShoppingItem[] {
  return items
    .filter(item => item.deletedAt === undefined)
    .sort((a, b) => Number(a.ticked) - Number(b.ticked) || a.text.localeCompare(b.text));
}

export interface ItemsState {
  status: 'loading' | 'ready' | 'error';
  items: ShoppingItem[];
  refetch: () => void;
}

// The shopping list as the person sees it: the server's list with every pending write laid over it, polled like the tasks.
export function useItems(): ItemsState {
  const { request } = useProtectedApi();
  const client = useQueryClient();

  const query = useQuery({
    queryKey: ITEMS_KEY,
    queryFn: async (): Promise<ItemsData> => {
      const startedAt = currentSettledCount();
      const fresh = await request('/api/hh/items') as ItemsData;
      const previous = client.getQueryData<ItemsData>(ITEMS_KEY);
      // A response that started before a write settled may not include it: keep what is on screen.
      return currentSettledCount() !== startedAt && previous ? previous : fresh;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const pending = useMutationState<PendingMutation>({
    filters: { status: 'pending', mutationKey: ['household'] },
    select: mutation => ({ mutationKey: mutation.options.mutationKey, variables: mutation.state.variables }),
  });
  const data = useMemo(() => (query.data ? applyPendingItems(query.data, pending) : undefined), [query.data, pending]);

  return {
    status: data ? 'ready' : query.isError ? 'error' : 'loading',
    items: data?.items ?? [],
    refetch: () => { void query.refetch(); },
  };
}
