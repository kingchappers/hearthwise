import { Anchor, Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import type { MoneyEntry } from '../../../src/money/types';
import { amountLine, kindLabel, shareLine, stateLabel } from '~/lib/moneyText';
import type { People } from '~/lib/moneyText';
import { formatDay } from '~/lib/taskText';

export interface EntryRowProps {
  entry: MoneyEntry;
  people: People;
  // A change to this entry is queued and has not reached the server.
  notSaved: boolean;
  // Buttons for the row, if it has any.
  children?: React.ReactNode;
  // Leaves out the amount lines, for a row that shows its own (a loan shows its progress).
  compact?: boolean;
}

export function EntryRow({ entry, people, notSaved, children, compact = false }: EntryRowProps) {
  const state = stateLabel(entry, people);
  const share = shareLine(entry, people);
  return (
    <li style={{ listStyle: 'none' }}>
      <Stack gap={2} py={8}>
        <Anchor component={Link} to={`/money/${entry.id}`} fw={600} style={{ overflowWrap: 'anywhere', display: 'block', minHeight: 44, paddingBlock: 10 }}>
          {entry.description}
        </Anchor>
        <Text size="sm">{`${kindLabel(entry.kind)} · ${formatDay(entry.on)}`}</Text>
        {!compact && <Text size="sm">{amountLine(entry, people)}</Text>}
        {!compact && share && <Text size="sm">{share}</Text>}
        {state && <Text size="sm" fw={600}>{state}</Text>}
        {notSaved && <Text size="sm">Not saved yet</Text>}
        {children}
      </Stack>
    </li>
  );
}
