import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { useItemActions } from '~/hooks/useItemActions';
import { useTaskActions } from '~/hooks/useTaskActions';
import { deletedEntries } from '~/lib/deleted';
import { useItems } from '~/lib/items';
import { pageTitle } from '~/lib/pageTitle';
import { useTasks } from '~/lib/queries';
import { formatDay, memberName } from '~/lib/taskText';
import { dayInZone } from '../../src/shared/schedule';
import type { Route } from './+types/deleted';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Deleted') }];

function DeletedContent() {
  const tasks = useTasks();
  const actions = useTaskActions();
  const itemActions = useItemActions();
  const items = useItems();
  const { tasks: taskRows, items: itemRows } = deletedEntries(tasks.tasks, items.items);
  const other = actions.members.find(member => member.userId !== actions.me.userId);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Stack maw={640}>
      <Title order={1} size="h3">Deleted</Title>
      <Text size="sm">Deleted tasks stay here for 30 days.</Text>
      {taskRows.length === 0 && itemRows.length === 0 && <Text>Nothing has been deleted.</Text>}
      {taskRows.length > 0 && (
        <section>
          <Title order={2} size="h5" mb={4}>Tasks</Title>
          <ul style={{ margin: 0, padding: 0 }}>
            {taskRows.map(task => {
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
        </section>
      )}
      {itemRows.length > 0 && (
        <section>
          <Title order={2} size="h5" mb={4}>Shopping</Title>
          <ul style={{ margin: 0, padding: 0 }}>
            {itemRows.map(item => (
              <li key={item.id} style={{ listStyle: 'none' }}>
                <Group justify="space-between" wrap="nowrap" py={6} gap="sm">
                  <Stack gap={2} miw={0}>
                    <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{item.text}</Text>
                    <Text size="sm">{`Deleted by ${memberName(actions.members, item.deletedBy ?? '')}, ${formatDay(dayInZone(item.deletedAt ?? 0, zone))}`}</Text>
                  </Stack>
                  <Button variant="light" aria-label={`Restore: ${item.text}`} onClick={() => itemActions.restore(item)}>Restore</Button>
                </Group>
              </li>
            ))}
          </ul>
        </section>
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
