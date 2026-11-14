import type { QueryClient } from '@tanstack/react-query';
import { applyPending } from './overlay';
import type { TasksData } from './overlay';
import { TASKS_KEY } from './queries';

const EMPTY: TasksData = { tasks: [], proposals: [], serverTime: 0 };

const idOf = (variables: unknown): string | undefined => (variables as { mutationId?: string } | undefined)?.mutationId;

// The cached tasks with the pending household writes laid over them, for a write that is about to run and needs the versions to send.
// Only writes queued BEFORE it count: household writes run one at a time, in order, so one queued behind it has not happened yet.
// Counting it would send a version from the future and the server would refuse the write. The write itself is never counted.
// Asked about no write in particular, every pending write counts.
export function dataForMutation(client: QueryClient, runningMutationId?: string): TasksData {
  const cached = client.getQueryData<TasksData>(TASKS_KEY) ?? EMPTY;
  const pending = client.getMutationCache().findAll({ mutationKey: ['household'], status: 'pending' });
  const position = runningMutationId === undefined ? -1 : pending.findIndex(mutation => idOf(mutation.state.variables) === runningMutationId);
  const earlier = position === -1 ? pending : pending.slice(0, position);
  return applyPending(cached, earlier.map(mutation => ({ mutationKey: mutation.options.mutationKey, variables: mutation.state.variables })));
}
