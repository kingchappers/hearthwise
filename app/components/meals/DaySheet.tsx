import { useState } from 'react';
import { ActionIcon, Anchor, Button, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import { Link } from 'react-router';
import type { PlanDay, PlanMeal, Recipe } from '../../../src/meals/types';
import { MAX_TITLE } from '../../../src/shared/mealValidation';
import { recipeState } from '~/lib/plan';
import { cookLink, dayHeading } from '~/lib/planText';
import { sortRecipes } from '~/lib/recipes';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';
import { LetThemKnow } from '../shared/LetThemKnow';
import { DinnerLine } from './DinnerLine';

export interface DaySheetProps {
  // The day the sheet is for. The sheet is closed when there is none.
  day: string | undefined;
  plan: PlanDay | undefined;
  recipes: Recipe[] | undefined;
  checkedAt: number | undefined;
  members: { userId: string; displayName: string }[];
  onClose: () => void;
  onSet: (day: string, meal: PlanMeal) => void;
  onClear: (day: string) => void;
}

const MAX_SERVINGS = 50;

function Content({ day, plan, recipes, checkedAt, members, onClose, onSet, onClear }: DaySheetProps & { day: string }) {
  const [all, setAll] = useState(false);
  const [name, setName] = useState('');
  const meal = plan?.meal;
  const state = plan ? recipeState(plan, recipes, checkedAt) : undefined;
  const author = plan ? members.find(member => member.userId === plan.updatedBy)?.displayName : undefined;
  const choices = sortRecipes((recipes ?? []).filter(recipe => recipe.deletedAt === undefined && (all || recipe.mealType === 'dinner')));

  function useName(event: React.FormEvent): void {
    event.preventDefault();
    const title = name.trim();
    if (title === '') return;
    onSet(day, { title });
    onClose();
  }

  return (
    <Stack>
      <DinnerLine plan={plan} recipes={recipes} checkedAt={checkedAt} />

      {meal?.recipeId !== undefined && meal.servings !== undefined && (
        <Group gap="xs" align="center">
          <ActionIcon variant="default" size={44} aria-label="Fewer servings" disabled={meal.servings <= 1} onClick={() => onSet(day, { ...meal, servings: meal.servings! - 1 })}><IconMinus size={18} /></ActionIcon>
          <Text fw={600} aria-live="polite" miw={90} ta="center">{`${meal.servings} ${meal.servings === 1 ? 'serving' : 'servings'}`}</Text>
          <ActionIcon variant="default" size={44} aria-label="More servings" disabled={meal.servings >= MAX_SERVINGS} onClick={() => onSet(day, { ...meal, servings: meal.servings! + 1 })}><IconPlus size={18} /></ActionIcon>
        </Group>
      )}
      {(state === 'found' || state === 'deleted') && meal?.recipeId !== undefined && (
        <Anchor component={Link} to={cookLink(meal.recipeId, meal.servings, day)}>Open recipe</Anchor>
      )}

      {plan?.addedAt !== undefined && (
        <Text size="sm">These ingredients are already on your shopping list. Changing the dinner won't change the list.</Text>
      )}

      <section>
        <Title order={3} size="h5" mb={4}>Choose a recipe</Title>
        {choices.length === 0 ? (
          <Text>{all ? 'No recipes yet. Add one in Recipes.' : 'No dinner recipes yet. Add one in Recipes, or show all recipes.'}</Text>
        ) : (
          <ul style={{ margin: 0, padding: 0 }}>
            {choices.map(recipe => (
              <li key={recipe.id} style={{ listStyle: 'none' }}>
                <Button
                  variant="subtle"
                  fullWidth
                  justify="space-between"
                  h={44}
                  aria-label={`Choose: ${recipe.title}`}
                  onClick={() => { onSet(day, { recipeId: recipe.id, title: recipe.title, servings: recipe.servings }); onClose(); }}
                >
                  {recipe.title}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button variant="default" mt="xs" onClick={() => setAll(value => !value)}>{all ? 'Show dinners only' : 'Show all recipes'}</Button>
      </section>

      <form onSubmit={useName}>
        <Group align="flex-end" gap="xs" wrap="wrap">
          <TextInput style={{ flex: '1 1 200px' }} label="Or type a name, like Takeaway" value={name} onChange={event => setName(event.currentTarget.value)} maxLength={MAX_TITLE} autoComplete="off" />
          <Button type="submit">Use this name</Button>
        </Group>
      </form>

      <LetThemKnow />
      {meal && <Group><Button variant="default" onClick={() => { onClear(day); onClose(); }}>Clear this day</Button></Group>}
      {author && <Text size="sm">{`Last changed by ${author}`}</Text>}
    </Stack>
  );
}

export function DaySheet(props: DaySheetProps) {
  const { day, onClose } = props;
  return (
    <ResponsiveSheet opened={day !== undefined} onClose={onClose} title={day ? dayHeading(day) : ''}>
      {day !== undefined && <Content key={day} {...props} day={day} />}
    </ResponsiveSheet>
  );
}
