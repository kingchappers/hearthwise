import { Anchor, Group, Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import type { Task } from '../../../src/tasks/types';
import { effectiveAssignee } from '~/lib/tasks';
import { assigneeLabel, dueLabel } from '~/lib/taskText';
import type { NamedMember } from '~/lib/taskText';
import { DidThisToday } from './DidThisToday';

export interface TaskRowProps {
  task: Task;
  today: string;
  roster: NamedMember[];
  viewerId: string;
  onComplete: (task: Task) => void;
}

export function TaskRow({ task, today, roster, viewerId, onComplete }: TaskRowProps) {
  const owner = effectiveAssignee(task, { members: roster });
  const due = dueLabel(task, today);
  return (
    <li style={{ listStyle: 'none' }}>
      <Group justify="space-between" wrap="nowrap" gap="sm" py={6}>
        <Stack gap={2} miw={0}>
          <Anchor component={Link} to={`/tasks/${task.id}`} fw={600} style={{ overflowWrap: 'anywhere' }}>{task.title}</Anchor>
          <Text size="sm">{[assigneeLabel(task, roster, viewerId), due].filter(Boolean).join(' · ')}</Text>
        </Stack>
        <DidThisToday task={task} own={owner === viewerId || owner === 'either' || owner === 'both'} onClick={() => onComplete(task)} />
      </Group>
    </li>
  );
}
