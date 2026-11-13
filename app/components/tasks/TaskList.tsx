import { Stack, Text, Title } from '@mantine/core';
import type { Task } from '../../../src/tasks/types';
import { groupTasks } from '~/lib/tasks';
import type { Group } from '~/lib/tasks';
import type { NamedMember } from '~/lib/taskText';
import { TaskRow } from './TaskRow';

const GROUPS: { group: Group; title: string }[] = [
  { group: 'today', title: 'Today' },
  { group: 'week', title: 'This week' },
  { group: 'later', title: 'Later' },
  { group: 'whenever', title: 'Whenever' },
];

export interface TaskListProps {
  tasks: Task[];
  today: string;
  roster: NamedMember[];
  viewerId: string;
  onComplete: (task: Task) => void;
}

export function TaskList({ tasks, today, roster, viewerId, onComplete }: TaskListProps) {
  const groups = groupTasks(tasks, today);
  if (GROUPS.every(({ group }) => groups[group].length === 0)) {
    return (
      <Stack>
        <Text>Nothing here yet.</Text>
        <Text size="sm">Chores and to-dos you add will show up here.</Text>
      </Stack>
    );
  }
  return (
    <Stack gap="lg">
      {GROUPS.filter(({ group }) => groups[group].length > 0).map(({ group, title }) => (
        <section key={group}>
          <Title order={2} size="h5" mb={4}>{title}</Title>
          <ul style={{ margin: 0, padding: 0 }}>
            {groups[group].map(task => (
              <TaskRow key={task.id} task={task} today={today} roster={roster} viewerId={viewerId} onComplete={onComplete} />
            ))}
          </ul>
        </section>
      ))}
    </Stack>
  );
}
