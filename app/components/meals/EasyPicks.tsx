import { useMemo, useState } from 'react';
import { Badge, Button, Group, NativeSelect, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router';
import type { Recipe } from '../../../src/meals/types';
import { easyShortlist } from '~/lib/recipes';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';
import { TIME_CHOICES } from './RecipeFilters';

export interface EasyPicksProps {
  opened: boolean;
  onClose: () => void;
  recipes: Recipe[];
  // For a test to be deterministic.
  random?: () => number;
  // "Make this tonight".
  onMake: (recipe: Recipe) => void;
}

function Detail({ recipe, onBack, onMake }: { recipe: Recipe; onBack: () => void; onMake: () => void }) {
  return (
    <Stack>
      <Title order={3} size="h4" style={{ overflowWrap: 'anywhere' }}>{recipe.title}</Title>
      <Group gap="xs">
        {recipe.minutes !== undefined && <Text size="sm">{`${recipe.minutes} min`}</Text>}
        {recipe.lowEnergy && <Badge variant="light" color="gray" tt="none">Low energy</Badge>}
      </Group>
      <Group gap="xs">
        <Button onClick={onMake}>Make this tonight</Button>
        <Button component={Link} to={`/recipes/${recipe.id}`} variant="default">Open recipe</Button>
        <Button variant="subtle" onClick={onBack}>Back</Button>
      </Group>
    </Stack>
  );
}

// Up to three dinners marked low energy, at random, for when there is little time, energy or food in the house. An optional time keeps
// the choice short. Nothing is remembered: there is no cooking history.
export function EasyPicks({ opened, onClose, recipes, random = Math.random, onMake }: EasyPicksProps) {
  const [maxMinutes, setMaxMinutes] = useState<number | undefined>(undefined);
  const [seed, setSeed] = useState(0);
  const [chosen, setChosen] = useState<Recipe | undefined>(undefined);
  // The seed is what a shuffle changes: the same recipes are picked from again.
  const picks = useMemo(() => easyShortlist(recipes, maxMinutes === undefined ? {} : { maxMinutes }, random), [recipes, maxMinutes, seed, random]); // eslint-disable-line react-hooks/exhaustive-deps

  function close(): void {
    setChosen(undefined);
    onClose();
  }

  return (
    <ResponsiveSheet opened={opened} onClose={close} title="Choose an easy dinner">
      {chosen ? (
        <Detail recipe={chosen} onBack={() => setChosen(undefined)} onMake={() => { onMake(chosen); close(); }} />
      ) : (
        <Stack>
          <NativeSelect
            label="Time"
            value={String(maxMinutes ?? 'any')}
            data={[{ value: 'any', label: 'Any time' }, ...TIME_CHOICES.map(minutes => ({ value: String(minutes), label: `Up to ${minutes} min` }))]}
            onChange={event => setMaxMinutes(event.currentTarget.value === 'any' ? undefined : Number(event.currentTarget.value))}
          />
          {picks.length === 0 ? (
            <Text>No easy dinners yet. Mark a recipe as low energy to see it here.</Text>
          ) : (
            <>
              <ul style={{ margin: 0, padding: 0 }}>
                {picks.map(recipe => (
                  <li key={recipe.id} style={{ listStyle: 'none' }}>
                    <UnstyledButton onClick={() => setChosen(recipe)} aria-label={`Look at ${recipe.title}`} w="100%" mih={44} py={8}>
                      <Group justify="space-between" wrap="nowrap" gap="sm">
                        <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{recipe.title}</Text>
                        {recipe.minutes !== undefined && <Text size="sm">{`${recipe.minutes} min`}</Text>}
                      </Group>
                    </UnstyledButton>
                  </li>
                ))}
              </ul>
              <Group><Button variant="default" onClick={() => setSeed(value => value + 1)}>Shuffle</Button></Group>
            </>
          )}
        </Stack>
      )}
    </ResponsiveSheet>
  );
}
