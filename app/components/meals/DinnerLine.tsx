import { Badge, Group, Stack, Text } from '@mantine/core';
import type { PlanDay, Recipe } from '../../../src/meals/types';
import { displayTitle, recipeState } from '~/lib/plan';

export interface DinnerLineProps {
  plan: PlanDay | undefined;
  recipes: Recipe[] | undefined;
  checkedAt: number | undefined;
}

const NOTES = { checking: 'Checking the recipe…', gone: 'This recipe is gone', deleted: 'This recipe was deleted' } as const;

// What is planned for a day, in words: the dinner's name, its minutes and low-energy mark if it has them, and a note when its recipe is
// being looked for, was deleted or has gone. The name falls back to the copy stored on the day, which is also what a plain-name dinner
// has.
export function DinnerLine({ plan, recipes, checkedAt }: DinnerLineProps) {
  const title = plan ? displayTitle(plan, recipes) : undefined;
  if (title === undefined || !plan) return <Text>Nothing planned yet</Text>;
  const state = recipeState(plan, recipes, checkedAt);
  const live = state === 'found' ? recipes?.find(recipe => recipe.id === plan.meal?.recipeId) : undefined;
  return (
    <Stack gap={2}>
      <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{title}</Text>
      {(live?.minutes !== undefined || live?.lowEnergy) && (
        <Group gap={6}>
          {live?.minutes !== undefined && <Text size="sm">{`${live.minutes} min`}</Text>}
          {live?.lowEnergy && <Badge variant="light" color="gray" tt="none">Low energy</Badge>}
        </Group>
      )}
      {state && state !== 'found' && <Text size="sm">{NOTES[state]}</Text>}
    </Stack>
  );
}
