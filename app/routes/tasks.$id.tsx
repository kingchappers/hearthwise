import { useState } from 'react';
import { Anchor, Button, Group, Stack, Text, Title } from '@mantine/core';
import { Link, useParams } from 'react-router';
import { isOtherMembersTask } from '../../src/tasks/ownership';
import { Checklist } from '~/components/tasks/Checklist';
import { DidThisToday } from '~/components/tasks/DidThisToday';
import { TaskHistory } from '~/components/tasks/TaskHistory';
import { TaskSheet } from '~/components/tasks/TaskSheet';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { useTaskActions } from '~/hooks/useTaskActions';
import { useTaskHistory } from '~/lib/history';
import { pageTitle } from '~/lib/pageTitle';
import { useTasks } from '~/lib/queries';
import { effectiveAssignee } from '~/lib/tasks';
import { assigneeLabel, dueLabel, repeatLabel } from '~/lib/taskText';
import type { Route } from './+types/tasks.$id';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Task') }];

function TaskContent() {
  const { id = '' } = useParams();
  const tasks = useTasks();
  const actions = useTaskActions();
  const history = useTaskHistory(id);
  const [editing, setEditing] = useState(false);

  const task = tasks.tasks.find(candidate => candidate.id === id && candidate.deletedAt === undefined);
  if (!task) {
    return (
      <Stack maw={640}>
        <Text>We couldn't find that task.</Text>
        <Anchor component={Link} to="/">Back to Today</Anchor>
      </Stack>
    );
  }

  const roster = actions.members;
  const other = roster.find(member => member.userId !== actions.me.userId);
  const owner = effectiveAssignee(task, { members: roster });
  const due = dueLabel(task, tasks.today);
  const theirs = isOtherMembersTask(task, actions.caller);
  const deleteLabel = actions.needsAsk('delete', task) ? `Ask ${other?.displayName ?? 'them'} to delete` : 'Delete';

  return (
    <Stack maw={640}>
      <Title order={1} size="h3" style={{ overflowWrap: 'anywhere' }}>{task.title}</Title>
      {task.notes && <Text style={{ whiteSpace: 'pre-wrap' }}>{task.notes}</Text>}
      <Stack gap={4}>
        <Group gap="xs"><Text fw={600}>For</Text><Text>{assigneeLabel(task, roster, actions.me.userId)}</Text></Group>
        <Group gap="xs"><Text fw={600}>Repeats</Text><Text>{repeatLabel(task.repeat)}</Text></Group>
        {due && <Group gap="xs"><Text fw={600}>When</Text><Text>{due}</Text></Group>}
      </Stack>
      <Group>
        <DidThisToday task={task} own={owner === actions.me.userId || owner === 'either' || owner === 'both'} onClick={() => actions.complete(task)} />
        <Button variant="default" onClick={() => setEditing(true)}>Edit</Button>
        {theirs && <Button variant="default" onClick={() => actions.swap(task)}>Swap this time</Button>}
        <Button variant="default" onClick={() => actions.remove(task)}>{deleteLabel}</Button>
      </Group>
      {task.checklist.length > 0 && (
        <section>
          <Title order={2} size="h5" mb="xs">Checklist</Title>
          <Checklist task={task} onTick={(stepId, done) => actions.tick(task, stepId, done)} />
        </section>
      )}
      <section>
        <Title order={2} size="h5" mb="xs">History</Title>
        {history.data
          ? <TaskHistory history={history.data} roster={roster} viewerId={actions.me.userId} />
          : <Text>{history.isError ? "We couldn't load the history." : 'Loading…'}</Text>}
      </section>
      <TaskSheet opened={editing} onClose={() => setEditing(false)} task={task} />
    </Stack>
  );
}

export default function TaskPage() {
  return (
    <DefaultLayout>
      <TaskContent />
    </DefaultLayout>
  );
}
