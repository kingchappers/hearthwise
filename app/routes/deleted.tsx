import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { useCalendarActions } from '~/hooks/useCalendarActions';
import { useItemActions } from '~/hooks/useItemActions';
import { useMoneyActions } from '~/hooks/useMoneyActions';
import { useRecipeActions } from '~/hooks/useRecipeActions';
import { useTaskActions } from '~/hooks/useTaskActions';
import { deletedEntries } from '~/lib/deleted';
import { useCalendar } from '~/lib/calendar';
import { useItems } from '~/lib/items';
import { useMoney } from '~/lib/money';
import { pageTitle } from '~/lib/pageTitle';
import { useRecipes } from '~/lib/recipes';
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
  const recipes = useRecipes();
  const recipeActions = useRecipeActions();
  const money = useMoney();
  const moneyActions = useMoneyActions();
  const calendar = useCalendar();
  const calendarActions = useCalendarActions();
  const { tasks: taskRows, items: itemRows, recipes: recipeRows, money: moneyRows, events: eventRows } = deletedEntries(tasks.tasks, items.items, recipes.recipes, money.entries, calendar.deleted);
  const other = actions.members.find(member => member.userId !== actions.me.userId);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <Stack maw={640}>
      <Title order={1} size="h3">Deleted</Title>
      <Text size="sm">Deleted tasks, shopping items and recipes stay here for 30 days.</Text>
      <Text size="sm">Deleted money entries stay until you restore them.</Text>
      <Text size="sm">Deleted events stay here for 30 days.</Text>
      {taskRows.length === 0 && itemRows.length === 0 && recipeRows.length === 0 && moneyRows.length === 0 && eventRows.length === 0 && <Text>Nothing has been deleted.</Text>}
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
      {recipeRows.length > 0 && (
        <section>
          <Title order={2} size="h5" mb={4}>Recipes</Title>
          <ul style={{ margin: 0, padding: 0 }}>
            {recipeRows.map(recipe => (
              <li key={recipe.id} style={{ listStyle: 'none' }}>
                <Group justify="space-between" wrap="nowrap" py={6} gap="sm">
                  <Stack gap={2} miw={0}>
                    <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{recipe.title}</Text>
                    <Text size="sm">{`Deleted by ${memberName(actions.members, recipe.deletedBy ?? '')}, ${formatDay(dayInZone(recipe.deletedAt ?? 0, zone))}`}</Text>
                  </Stack>
                  <Button variant="light" aria-label={`Restore: ${recipe.title}`} onClick={() => recipeActions.restore(recipe)}>Restore</Button>
                </Group>
              </li>
            ))}
          </ul>
        </section>
      )}
      {moneyRows.length > 0 && (
        <section>
          <Title order={2} size="h5" mb={4}>Money</Title>
          <ul style={{ margin: 0, padding: 0 }}>
            {moneyRows.map(entry => (
              <li key={entry.id} style={{ listStyle: 'none' }}>
                <Group justify="space-between" wrap="nowrap" py={6} gap="sm">
                  <Stack gap={2} miw={0}>
                    <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{entry.description}</Text>
                    <Text size="sm">{`Deleted by ${memberName(actions.members, entry.deletedBy ?? '')}, ${formatDay(dayInZone(entry.deletedAt ?? 0, zone))}`}</Text>
                  </Stack>
                  {/* A change not saved yet has not got the server's deletion time, which a restore must name. */}
                  <Button variant="light" aria-label={`Restore: ${entry.description}`} disabled={!money.canWrite || money.unsavedIds.has(entry.id)} onClick={() => moneyActions.restore(entry)}>Restore</Button>
                </Group>
              </li>
            ))}
          </ul>
        </section>
      )}
      {eventRows.length > 0 && (
        <section>
          <Title order={2} size="h5" mb={4}>Events</Title>
          <ul style={{ margin: 0, padding: 0 }}>
            {eventRows.map(event => (
              <li key={event.id} style={{ listStyle: 'none' }}>
                <Group justify="space-between" wrap="nowrap" py={6} gap="sm">
                  <Stack gap={2} miw={0}>
                    <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{event.title}</Text>
                    <Text size="sm">{`Deleted by ${memberName(actions.members, event.deletedBy ?? '')}, ${formatDay(dayInZone(event.deletedAt ?? 0, zone))}`}</Text>
                  </Stack>
                  {/* A change not saved yet has not got the server's deletion time, which a restore must name. */}
                  <Button variant="light" aria-label={`Restore: ${event.title}`} disabled={calendar.unsavedIds.has(event.id)} onClick={() => calendarActions.restore(event)}>Restore</Button>
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
