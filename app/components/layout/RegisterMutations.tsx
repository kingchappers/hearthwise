import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { registerMutations } from '~/lib/mutations';
import { dataForMutation } from '~/lib/pending';

// Registers every household mutation with the query client, once the person is signed in and has a household. Renders nothing.
export function RegisterMutations() {
  const client = useQueryClient();
  const { request } = useProtectedApi();

  useEffect(() => {
    registerMutations(client, request, except => dataForMutation(client, except), message => notifications.show({ color: 'honey', message }));
  }, [client, request]);

  return null;
}
