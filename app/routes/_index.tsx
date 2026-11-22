import { useState } from 'react';
import { Button, Group, Loader, Stack, Title } from '@mantine/core';
import { ComingUp } from '~/components/calendar/ComingUp';
import { NowAndNext } from '~/components/calendar/NowAndNext';
import { EasyPicks } from '~/components/meals/EasyPicks';
import { Tonight } from '~/components/meals/Tonight';
import { NextThing } from '~/components/tasks/NextThing';
import { ProposalBanner } from '~/components/tasks/ProposalBanner';
import { TaskList } from '~/components/tasks/TaskList';
import { TaskSheet } from '~/components/tasks/TaskSheet';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { LoadError } from '~/components/layout/LoadError';
import { LetThemKnow } from '~/components/shared/LetThemKnow';
import { PushPrompt } from '~/components/settings/PushPrompt';
import { usePlanActions } from '~/hooks/usePlanActions';
import { useTaskActions } from '~/hooks/useTaskActions';
import { useTimelineSources } from '~/lib/calendar';
import { comingUp, projectLines } from '~/lib/comingUp';
import { useProjects } from '~/lib/projects';
import { useHousehold } from '~/lib/household';
import { pageTitle } from '~/lib/pageTitle';
import { useNow } from '~/lib/useNow';
import { usePlan } from '~/lib/plan';
import { useTasks } from '~/lib/queries';
import { nextThing, offerableCount } from '~/lib/tasks';
import { nowAndNext } from '../../src/shared/timeline';
import type { Route } from './+types/_index';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Today') }];

type View = 'list' | 'next';

function TodayContent() {
  const tasks = useTasks();
  const household = useHousehold();
  const actions = useTaskActions();
  const plan = usePlan();
  const sources = useTimelineSources();
  const now = useNow();
  const planActions = usePlanActions();
  const [easy, setEasy] = useState(false);
  // The viewer's own default view is saved with their settings; switching here lasts for this visit only.
  const [chosen, setChosen] = useState<View | undefined>(undefined);
  // "Show a different task" is this visit only too, and never touches the task.
  const [skipped, setSkipped] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const view: View = chosen ?? household.data?.me.settings.defaultView ?? 'list';
  const showComing = household.data?.me.settings.todayComingUp !== false;
  const showProjects = household.data?.me.settings.todayProjects !== false;
  const projects = useProjects({ counts: true, enabled: showProjects });

  if (tasks.status === 'loading') return <Group justify="center" py="xl" role="status" aria-label="Loading your tasks"><Loader /></Group>;
  if (tasks.status === 'error') return <LoadError thing="tasks" onRetry={tasks.refetch} />;

  const next = nextThing(tasks.tasks, actions.me.userId, tasks.today, { members: actions.members }, skipped);
  return (
    <Stack maw={640}>
      <Title order={1} size="h3">Today</Title>
      {sources.status === 'ready' && (
        <NowAndNext {...nowAndNext(sources.inputsFor(sources.calendar.today), now, sources.calendar.timezone, sources.calendar.me)} />
      )}
      {sources.status === 'ready' && (showComing || showProjects) && (
        <ComingUp
          items={showComing ? comingUp(sources.inputsFor, sources.calendar.today, sources.calendar.me) : []}
          projects={showProjects ? projectLines(projects.projects, sources.calendar.today, projects.me, projects.members) : []}
          today={sources.calendar.today}
          relative={household.data?.me.settings.relativeTimes === true}
        />
      )}
      {plan.status === 'ready' && (
        <Tonight today={plan.today} plan={plan.days.find(day => day.day === plan.today)} recipes={plan.recipes} checkedAt={plan.recipesCheckedAt} onPickEasy={() => setEasy(true)} />
      )}
      <Group>
        <Button onClick={() => setAdding(true)}>Add a task</Button>
        <Button variant="default" onClick={() => setChosen(view === 'list' ? 'next' : 'list')}>
          {view === 'list' ? 'Show one task' : 'Show all tasks'}
        </Button>
      </Group>
      <PushPrompt />
      <LetThemKnow />
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
        <TaskList tasks={tasks.tasks} today={tasks.today} roster={actions.members} viewerId={actions.me.userId} onComplete={actions.complete} relative={household.data?.me.settings.relativeTimes === true} />
      ) : (
        <NextThing
          task={next}
          position={skipped.length + 1}
          total={offerableCount(tasks.tasks, actions.me.userId, { members: actions.members })}
          today={tasks.today}
          relative={household.data?.me.settings.relativeTimes === true}
          roster={actions.members}
          viewerId={actions.me.userId}
          onDone={() => next && actions.complete(next)}
          onNotNow={() => next && setSkipped([...skipped, next.id])}
        />
      )}
      <TaskSheet opened={adding} onClose={() => setAdding(false)} />
      <EasyPicks
        opened={easy}
        onClose={() => setEasy(false)}
        recipes={plan.recipes ?? []}
        onMake={recipe => planActions.set(plan.today, { recipeId: recipe.id, title: recipe.title, servings: recipe.servings })}
      />
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
