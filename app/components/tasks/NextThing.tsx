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
  // Where this card is among the ones that can be offered, and how many there are, so the person knows there is an end.
  position?: number;
  total?: number;
  relative?: boolean;
}

// One card: the next thing for this person. "Show a different task" only moves to the next card for this visit; it changes nothing for anyone.
export function NextThing({ task, today, roster, viewerId, onDone, onNotNow, position, total, relative = false }: NextThingProps) {
  if (!task) {
    return (
      <Stack gap={4}>
        <Text>That's all for now.</Text>
        <Text size="sm">Show all tasks to see everything, including the ones you set aside.</Text>
      </Stack>
    );
  }
  const owner = effectiveAssignee(task, { members: roster });
  const due = dueLabel(task, today, relative);
  return (
    <Card withBorder padding="lg">
      <Stack>
        {position !== undefined && total !== undefined && <Text size="sm">{`Task ${position} of ${total}`}</Text>}
        <Text fw={600} size="xl" style={{ overflowWrap: 'anywhere' }}>{task.title}</Text>
        <Text>{[assigneeLabel(task, roster, viewerId), due].filter(Boolean).join(' · ')}</Text>
        <Group>
          <DidThisToday task={task} own={owner === viewerId || owner === 'either' || owner === 'both'} onClick={onDone} />
          <Button variant="default" onClick={onNotNow}>Show a different task</Button>
        </Group>
        <Text size="sm">Show a different task sets this one aside for this visit. Nothing changes for anyone.</Text>
      </Stack>
    </Card>
  );
}
