import { useState } from 'react';
import { Button, Group, Loader, Stack, Title } from '@mantine/core';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { LoadError } from '~/components/layout/LoadError';
import { DaySheet } from '~/components/meals/DaySheet';
import { EasyPicks } from '~/components/meals/EasyPicks';
import { WeekPlan } from '~/components/meals/WeekPlan';
import { LetThemKnow } from '~/components/shared/LetThemKnow';
import { usePlanActions } from '~/hooks/usePlanActions';
import { useHousehold } from '~/lib/household';
import { pageTitle } from '~/lib/pageTitle';
import { usePlan } from '~/lib/plan';
import type { Route } from './+types/plan';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Plan') }];

function PlanContent() {
  const plan = usePlan();
  const household = useHousehold();
  const actions = usePlanActions();
  const [openDay, setOpenDay] = useState<string | undefined>(undefined);
  const [easy, setEasy] = useState(false);

  if (plan.status === 'loading') return <Group justify="center" py="xl" role="status" aria-label="Loading the plan"><Loader /></Group>;
  if (plan.status === 'error') return <LoadError thing="plan" onRetry={plan.refetch} />;

  const members = household.data?.members ?? [];
  return (
    <Stack maw={640}>
      <Title order={1} size="h3">Plan</Title>
      <Group>
        <Button variant="default" onClick={() => setEasy(true)}>Pick something easy</Button>
      </Group>
      <LetThemKnow />
      <WeekPlan days={plan.days} recipes={plan.recipes} checkedAt={plan.recipesCheckedAt} today={plan.today} onOpen={setOpenDay} />
      <DaySheet
        day={openDay}
        plan={plan.days.find(day => day.day === openDay)}
        recipes={plan.recipes}
        checkedAt={plan.recipesCheckedAt}
        members={members}
        onClose={() => setOpenDay(undefined)}
        onSet={actions.set}
        onClear={actions.clear}
      />
      <EasyPicks
        opened={easy}
        onClose={() => setEasy(false)}
        recipes={plan.recipes ?? []}
        onMake={recipe => actions.set(plan.today, { recipeId: recipe.id, title: recipe.title, servings: recipe.servings })}
      />
    </Stack>
  );
}

export default function Plan() {
  return (
    <DefaultLayout>
      <PlanContent />
    </DefaultLayout>
  );
}
