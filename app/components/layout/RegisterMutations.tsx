import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { registerMutations } from '~/lib/mutations';
import { applyPending } from '~/lib/overlay';
import type { TasksData } from '~/lib/overlay';
import { TASKS_KEY } from '~/lib/queries';

const EMPTY: TasksData = { tasks: [], proposals: [], serverTime: 0 };

// The cached tasks with every pending write applied except the one that is asking, so a write reads the versions it should send.
function currentData(client: QueryClient, exceptMutationId?: string): TasksData {
  const cached = client.getQueryData<TasksData>(TASKS_KEY) ?? EMPTY;
  const pending = client.getMutationCache()
    .findAll({ mutationKey: ['household'], status: 'pending' })
    .filter(mutation => (mutation.state.variables as { mutationId?: string } | undefined)?.mutationId !== exceptMutationId)
    .map(mutation => ({ mutationKey: mutation.options.mutationKey, variables: mutation.state.variables }));
  return applyPending(cached, pending);
}

// Registers every household mutation with the query client, once the person is signed in and has a household. Renders nothing.
export function RegisterMutations() {
  const client = useQueryClient();
  const { request } = useProtectedApi();

  useEffect(() => {
    registerMutations(client, request, except => currentData(client, except), message => notifications.show({ color: 'honey', message }));
  }, [client, request]);

  return null;
}
