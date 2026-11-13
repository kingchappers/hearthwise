import { Button, Card, Group, Stack, Text } from '@mantine/core';
import type { Task } from '../../../src/tasks/types';
import { effectiveAssignee } from '~/lib/tasks';
import { assigneeLabel, dueLabel } from '~/lib/taskText';
import type { NamedMember } from '~/lib/taskText';
import { DidThisToday } from './DidThisToday';

export interface NextThingProps {
  task: Task | undefined;
  today: string;
  roster: NamedMember[];
  viewerId: string;
  onDone: () => void;
  onNotNow: () => void;
}

// One card: the next thing for this person. "Not now" only moves to the next card for this visit; it changes nothing for anyone.
export function NextThing({ task, today, roster, viewerId, onDone, onNotNow }: NextThingProps) {
  if (!task) return <Text>Nothing left for now.</Text>;
  const owner = effectiveAssignee(task, { members: roster });
  const due = dueLabel(task, today);
  return (
    <Card withBorder padding="lg">
      <Stack>
        <Text fw={600} size="xl" style={{ overflowWrap: 'anywhere' }}>{task.title}</Text>
        <Text>{[assigneeLabel(task, roster, viewerId), due].filter(Boolean).join(' · ')}</Text>
        <Group>
          <DidThisToday task={task} own={owner === viewerId || owner === 'either' || owner === 'both'} onClick={onDone} />
          <Button variant="default" onClick={onNotNow}>Not now</Button>
        </Group>
      </Stack>
    </Card>
  );
}
