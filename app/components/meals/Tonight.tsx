import { Button, Group, Paper, Stack, Title } from '@mantine/core';
import { Link } from 'react-router';
import type { PlanDay, Recipe } from '../../../src/meals/types';
import { displayTitle, recipeState } from '~/lib/plan';
import { cookLink } from '~/lib/planText';
import { DinnerLine } from './DinnerLine';

export interface TonightProps {
  today: string;
  plan: PlanDay | undefined;
  recipes: Recipe[] | undefined;
  checkedAt: number | undefined;
  onPickEasy: () => void;
}

// The top of Today: tonight's dinner, one tap from the cooking view. With nothing planned, a way to find something easy.
export function Tonight({ today, plan, recipes, checkedAt, onPickEasy }: TonightProps) {
  const title = plan ? displayTitle(plan, recipes) : undefined;
  const state = plan ? recipeState(plan, recipes, checkedAt) : undefined;
  const opens = state === 'found' || state === 'deleted';
  return (
    <Paper withBorder p="md" radius="md" component="section" aria-labelledby="tonight-heading">
      <Stack gap="xs">
        <Title id="tonight-heading" order={2} size="h5">Tonight</Title>
        <DinnerLine plan={plan} recipes={recipes} checkedAt={checkedAt} />
        <Group gap="xs">
          {title === undefined && <Button variant="default" onClick={onPickEasy}>Choose an easy dinner</Button>}
          {opens && plan?.meal?.recipeId !== undefined && (
            <Button component={Link} to={cookLink(plan.meal.recipeId, plan.meal.servings, today)} aria-label={`Open ${title}`}>Open recipe</Button>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}
