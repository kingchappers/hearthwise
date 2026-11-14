import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { useTaskActions } from '~/hooks/useTaskActions';
import { deletedTasks } from '~/lib/deleted';
import { pageTitle } from '~/lib/pageTitle';
import { useTasks } from '~/lib/queries';
import { formatDay, memberName } from '~/lib/taskText';
import { dayInZone } from '../../src/shared/schedule';
import type { Route } from './+types/deleted';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Deleted') }];

function DeletedContent() {
  const tasks = useTasks();
  const actions = useTaskActions();
  const rows = deletedTasks(tasks.tasks);
  const other = actions.members.find(member => member.userId !== actions.me.userId);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Stack maw={640}>
      <Title order={1} size="h3">Deleted</Title>
      <Text size="sm">Deleted tasks stay here for 30 days.</Text>
      {rows.length === 0 ? <Text>Nothing has been deleted.</Text> : (
        <ul style={{ margin: 0, padding: 0 }}>
          {rows.map(task => {
            const label = actions.needsAsk('restore', task) ? `Ask ${other?.displayName ?? 'them'} to restore` : 'Restore';
            return (
              <li key={task.id} style={{ listStyle: 'none' }}>
                <Group justify="space-between" wrap="nowrap" py={6} gap="sm">
                  <Stack gap={2} miw={0}>
                    <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{task.title}</Text>
                    <Text size="sm">{`Deleted by ${memberName(actions.members, task.deletedBy ?? '')}, ${formatDay(dayInZone(task.deletedAt ?? 0, zone))}`}</Text>
                  </Stack>
                  <Button variant="light" aria-label={`${label}: ${task.title}`} onClick={() => actions.restore(task)}>{label}</Button>
                </Group>
              </li>
            );
          })}
        </ul>
      )}
    </Stack>
  );
}

export default function Deleted() {
  return (
    <DefaultLayout>
      <DeletedContent />
    </DefaultLayout>
  );
}
