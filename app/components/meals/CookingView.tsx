import { useState } from 'react';
import { ActionIcon, Alert, Badge, Button, Checkbox, Group, Stack, Text, Title } from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import type { Recipe } from '../../../src/meals/types';
import { formatAmount, parseIngredientLine } from '../../../src/shared/ingredients';
import { MAX_SERVINGS } from '../../../src/shared/mealValidation';
import { roundAmount, scaleFactor } from '../../../src/shared/shoppingLines';
import { readCooking, startAgain, tickLine, writeServings } from '~/lib/cookingState';
import { useWakeLock } from '~/lib/wakeLock';

export interface CookingViewProps {
  recipe: Recipe;
  userId: string;
  // The servings planned for the day the person came from, if any.
  plannedServings?: number;
  // A deleted recipe is shown but cannot be ticked.
  readOnly?: boolean;
  onRestore?: () => void;
}

const servingsText = (count: number): string => `${count} ${count === 1 ? 'serving' : 'servings'}`;

// An ingredient line at `factor` times its written amount, rounded to the nearest step, because a cook can taste as they go. At the
// recipe's own servings the line is shown as typed. A line with no amount cannot be scaled, and says so when the factor is not 1.
function scaledLine(line: string, factor: number): { text: string; notScaled: boolean } {
  if (Math.abs(factor - 1) < 1e-9) return { text: line, notScaled: false };
  const parsed = parseIngredientLine(line);
  if (parsed.amount === undefined) return { text: line, notScaled: true };
  const amount = formatAmount(roundAmount(parsed.amount * factor, parsed.unit, 'nearest'), parsed.unit);
  return { text: `${amount} ${parsed.name}${parsed.note ? `, ${parsed.note}` : ''}`, notScaled: false };
}

export function CookingView({ recipe, userId, plannedServings, readOnly = false, onRestore }: CookingViewProps) {
  useWakeLock();
  const base = plannedServings ?? recipe.servings;
  const [stored] = useState(() => readCooking(userId, recipe.id));
  const [servings, setServings] = useState(stored?.servings ?? base);
  const [ingredients, setIngredients] = useState<number[]>(stored?.ingredients ?? []);
  const [steps, setSteps] = useState<number[]>(stored?.steps ?? []);
  const factor = scaleFactor(servings, recipe.servings);

  function tick(kind: 'ingredients' | 'steps', index: number, ticked: boolean): void {
    tickLine(userId, recipe.id, kind, index, ticked, servings);
    const change = (positions: number[]): number[] => (ticked ? [...positions.filter(position => position !== index), index] : positions.filter(position => position !== index));
    if (kind === 'ingredients') setIngredients(change);
    else setSteps(change);
  }

  function changeServings(next: number): void {
    setServings(next);
    writeServings(userId, recipe.id, next);
  }

  function again(): void {
    startAgain(userId, recipe.id, base);
    setIngredients([]);
    setSteps([]);
    setServings(base);
  }

  return (
    <Stack maw={640}>
      <Title order={1} size="h3" style={{ overflowWrap: 'anywhere' }}>{recipe.title}</Title>
      {readOnly && (
        <Alert color="honey" title="This recipe was deleted.">
          <Button onClick={onRestore}>Restore</Button>
        </Alert>
      )}
      <Group gap="xs">
        {recipe.minutes !== undefined && <Text size="sm">{`${recipe.minutes} min`}</Text>}
        {recipe.lowEnergy && <Badge variant="light" color="gray" tt="none">Low energy</Badge>}
      </Group>
      {recipe.nutrition && <Text size="sm">{`Nutrition per serving: ${recipe.nutrition}`}</Text>}

      <Group gap="xs" align="center">
        <ActionIcon variant="default" size={44} aria-label="Fewer servings" disabled={readOnly || servings <= 1} onClick={() => changeServings(servings - 1)}><IconMinus size={18} /></ActionIcon>
        <Text fw={600} aria-live="polite" miw={90} ta="center">{servingsText(servings)}</Text>
        <ActionIcon variant="default" size={44} aria-label="More servings" disabled={readOnly || servings >= MAX_SERVINGS} onClick={() => changeServings(servings + 1)}><IconPlus size={18} /></ActionIcon>
      </Group>
      {servings !== recipe.servings && <Text size="sm">{`Steps are written for ${recipe.servings} ${recipe.servings === 1 ? 'serving' : 'servings'}.`}</Text>}

      <section>
        <Title order={2} size="h5" mb={4}>Get everything out</Title>
        {recipe.ingredients.length === 0 ? <Text>No ingredients yet.</Text> : (
          <ul aria-label="Get everything out" style={{ margin: 0, padding: 0 }}>
            {recipe.ingredients.map((line, index) => {
              const shown = scaledLine(line, factor);
              return (
                <li key={`${index}-${line}`} style={{ listStyle: 'none', minHeight: 44, display: 'flex', alignItems: 'center' }}>
                  <Checkbox
                    size="md"
                    disabled={readOnly}
                    checked={ingredients.includes(index)}
                    onChange={event => tick('ingredients', index, event.currentTarget.checked)}
                    label={<>{shown.text}{shown.notScaled && <>{' '}<Text span size="sm">Not scaled</Text></>}</>}
                    style={{ overflowWrap: 'anywhere' }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <Title order={2} size="h5" mb={4}>Steps</Title>
        {recipe.steps.length === 0 ? <Text>No steps yet.</Text> : (
          <ul aria-label="Steps" style={{ margin: 0, padding: 0 }}>
            {recipe.steps.map((line, index) => (
              <li key={`${index}-${line}`} style={{ listStyle: 'none', minHeight: 44, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text span fw={600} aria-hidden>{`${index + 1}.`}</Text>
                <Checkbox
                  size="md"
                  disabled={readOnly}
                  checked={steps.includes(index)}
                  onChange={event => tick('steps', index, event.currentTarget.checked)}
                  label={line}
                  style={{ overflowWrap: 'anywhere' }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {!readOnly && <Group><Button variant="default" onClick={again}>Start again</Button></Group>}
    </Stack>
  );
}
