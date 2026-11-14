import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { useMutationState } from '@tanstack/react-query';
import { dismissDropped, useDropped } from '~/lib/dropped';

// What is waiting to be saved, and what could not be. Changes made offline show here until the connection returns.
export function PendingWritesBanner() {
  const waiting = useMutationState({ filters: { status: 'pending', mutationKey: ['household'] } }).length;
  const dropped = useDropped();
  if (waiting === 0 && dropped.length === 0) return null;

  return (
    <Stack gap="xs" mb="sm">
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
              {entry.ask && <Button onClick={() => { entry.ask?.(); dismissDropped(entry.id); }}>Ask</Button>}
              <Button variant="default" onClick={() => dismissDropped(entry.id)}>Dismiss</Button>
            </Group>
          </Stack>
        </Alert>
      ))}
    </Stack>
  );
}
