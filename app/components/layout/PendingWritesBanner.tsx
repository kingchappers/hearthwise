import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { useMutationState } from '@tanstack/react-query';
import { useEffect } from 'react';
import { dismissDropped, loadDropped, recordDropped, useDropped } from '~/lib/dropped';
import { readStoredUser } from '~/lib/persistedCache';
import { useOnline } from '~/lib/useOnline';

// What is waiting to be saved, and what could not be. Changes made offline show here until the connection returns.
export function PendingWritesBanner() {
  const waiting = useMutationState({ filters: { status: 'pending', mutationKey: ['household'] } }).length;
  const me = readStoredUser();
  useEffect(() => loadDropped(me), [me]);
  const dropped = useDropped().filter(entry => entry.userId === undefined || entry.userId === me);
  const online = useOnline();
  if (online && waiting === 0 && dropped.length === 0) return null;

  return (
    <Stack gap="xs" mb="sm">
      {!online && (
        <div role="status" aria-live="polite">
          <Text size="sm">Offline. Changes are kept on this phone and save when you are back.</Text>
        </div>
      )}
      {waiting > 0 && (
        <div role="status" aria-live="polite">
          <Text size="sm">{`${waiting} ${waiting === 1 ? 'change' : 'changes'} waiting to be saved`}</Text>
        </div>
      )}
      {dropped.map(entry => (
        <Alert key={entry.id} color="honey" role="alert">
          <Stack gap="xs">
            <Text>{entry.message}</Text>
            <Group>
              {entry.ask && <Button onClick={() => { entry.ask?.(); dismissDropped(entry.id); recordDropped({ id: `${entry.id}-sent`, message: 'Request sent. They can agree to it or not.', userId: entry.userId }); }}>Send as a request</Button>}
              <Button variant="default" onClick={() => dismissDropped(entry.id)}>Dismiss</Button>
            </Group>
          </Stack>
        </Alert>
      ))}
    </Stack>
  );
}
