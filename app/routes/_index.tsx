import { useState } from 'react';
import { Button, Group, Loader, Stack, Title } from '@mantine/core';
import { NextThing } from '~/components/tasks/NextThing';
import { ProposalBanner } from '~/components/tasks/ProposalBanner';
import { TaskList } from '~/components/tasks/TaskList';
import { TaskSheet } from '~/components/tasks/TaskSheet';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { LoadError } from '~/components/layout/LoadError';
import { useTaskActions } from '~/hooks/useTaskActions';
import { useHousehold } from '~/lib/household';
import { pageTitle } from '~/lib/pageTitle';
import { useTasks } from '~/lib/queries';
import { nextThing } from '~/lib/tasks';
import type { Route } from './+types/_index';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Today') }];

type View = 'list' | 'next';

function TodayContent() {
  const tasks = useTasks();
  const household = useHousehold();
  const actions = useTaskActions();
  // The viewer's own default view is saved with their settings; switching here lasts for this visit only.
  const [chosen, setChosen] = useState<View | undefined>(undefined);
  // "Not now" is this visit only too, and never touches the task.
  const [skipped, setSkipped] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const view: View = chosen ?? household.data?.me.settings.defaultView ?? 'list';

  if (tasks.status === 'loading') return <Group justify="center" py="xl" role="status" aria-label="Loading your tasks"><Loader /></Group>;
  if (tasks.status === 'error') return <LoadError thing="tasks" onRetry={tasks.refetch} />;

  const next = nextThing(tasks.tasks, actions.me.userId, tasks.today, { members: actions.members }, skipped);
  return (
    <Stack maw={640}>
      <Title order={1} size="h3">Today</Title>
      <Group>
        <Button onClick={() => setAdding(true)}>Add a task</Button>
        <Button variant="default" onClick={() => setChosen(view === 'list' ? 'next' : 'list')}>
          {view === 'list' ? 'Show the next thing' : 'Show the full list'}
        </Button>
      </Group>
      <ProposalBanner
        proposals={tasks.proposals}
        tasks={tasks.tasks}
        roster={actions.members}
        viewerId={actions.me.userId}
        onAccept={actions.accept}
        onDecline={actions.decline}
        onWithdraw={actions.withdraw}
      />
      {view === 'list' ? (
        <TaskList tasks={tasks.tasks} today={tasks.today} roster={actions.members} viewerId={actions.me.userId} onComplete={actions.complete} />
      ) : (
        <NextThing
          task={next}
          today={tasks.today}
          roster={actions.members}
          viewerId={actions.me.userId}
          onDone={() => next && actions.complete(next)}
          onNotNow={() => next && setSkipped([...skipped, next.id])}
        />
      )}
      <TaskSheet opened={adding} onClose={() => setAdding(false)} />
    </Stack>
  );
}

export default function Today() {
  return (
    <DefaultLayout>
      <TodayContent />
    </DefaultLayout>
  );
}
