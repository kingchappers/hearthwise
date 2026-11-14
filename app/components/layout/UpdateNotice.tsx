import { useState } from 'react';
import { Alert, Button, Group, Text } from '@mantine/core';
import { useUpdateReady } from '~/lib/serviceWorker';

export function UpdateNotice() {
  const ready = useUpdateReady();
  const [dismissed, setDismissed] = useState(false);
  if (!ready || dismissed) return null;
  return (
    <Alert color="honey" role="status">
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm">New version ready. It'll load next time.</Text>
        <Button variant="default" onClick={() => setDismissed(true)}>Dismiss</Button>
      </Group>
    </Alert>
  );
}
