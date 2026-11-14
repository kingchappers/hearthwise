import { useMemo } from 'react';
import { useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import { dayInZone } from '../../src/shared/schedule';
import type { Proposal, Task } from '../../src/tasks/types';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { useHousehold } from './household';
import { applyPending } from './overlay';
import type { PendingMutation, TasksData } from './overlay';

export const TASKS_KEY = ['tasks'] as const;

const POLL_MS = 10_000;

// Goes up each time a household mutation settles. A refetch that started before that may not include the write, so its answer is
// not trusted over what is already on screen.
let settledCount = 0;

export function noteMutationSettled(): void {
  settledCount += 1;
}

export const currentSettledCount = (): number => settledCount;

export interface TasksState {
  status: 'loading' | 'ready' | 'error';
  tasks: Task[];
  proposals: Proposal[];
  today: string;
  refetch: () => void;
}

// The household's tasks as the person sees them: the server's list with every pending write laid over it. Polled every 10 seconds
// while the app is visible and on return to it, and polling carries on while writes are pending.
export function useTasks(): TasksState {
  const { request } = useProtectedApi();
  const client = useQueryClient();
  const household = useHousehold();

  const query = useQuery({
    queryKey: TASKS_KEY,
    queryFn: async (): Promise<TasksData> => {
      const startedAt = settledCount;
      const fresh = await request('/api/hh/tasks') as TasksData;
      const previous = client.getQueryData<TasksData>(TASKS_KEY);
      return settledCount !== startedAt && previous ? previous : fresh;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const pending = useMutationState<PendingMutation>({
    filters: { status: 'pending', mutationKey: ['household'] },
    select: mutation => ({ mutationKey: mutation.options.mutationKey, variables: mutation.state.variables }),
  });
  const data = useMemo(() => (query.data ? applyPending(query.data, pending) : undefined), [query.data, pending]);

  const timezone = household.data?.household.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const status = data ? 'ready' : query.isError ? 'error' : 'loading';
  return {
    status,
    tasks: data?.tasks ?? [],
    proposals: data?.proposals ?? [],
    today: dayInZone(Date.now(), timezone),
    refetch: () => { void query.refetch(); },
  };
}
