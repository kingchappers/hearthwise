import { Paper, Stack, Text } from '@mantine/core';
import type { Total } from '../../../src/shared/ledger';
import { totalText, unsavedText } from '~/lib/moneyText';
import type { People } from '~/lib/moneyText';

export interface TotalCardProps {
  total: Total;
  people: People;
  // How many money changes are queued: the other phone shows the total without them.
  unsaved: number;
}

// The one figure: who pays whom and how much, said in words. Direction is never carried by colour.
export function TotalCard({ total, people, unsaved }: TotalCardProps) {
  return (
    <Paper withBorder p="md" radius="md" component="section" aria-label="Total">
      <Stack gap={4}>
        <Text fw={700} size="xl" style={{ overflowWrap: 'anywhere' }}>{totalText(total, people.meName, people.otherName)}</Text>
        {unsaved > 0 && <Text size="sm" role="status">{unsavedText(unsaved)}</Text>}
      </Stack>
    </Paper>
  );
}
