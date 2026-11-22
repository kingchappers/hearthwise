import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Group, Stack, Switch, Text, Title } from '@mantine/core';
import type { PlanDay, Recipe } from '../../../src/meals/types';
import { normaliseName, parseIngredientLine } from '../../../src/shared/ingredients';
import { buildLines, MAX_LINES } from '../../../src/shared/shoppingLines';
import type { PlannedMeal } from '../../../src/shared/shoppingLines';
import type { ShoppingItem } from '../../../src/shopping/types';
import { displayTitle, recipeState } from '~/lib/plan';
import { dayHeading } from '~/lib/planText';
import { clearReview, readReview, saveReview } from '~/lib/reviewState';
import type { ReviewState } from '~/lib/reviewState';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';
import { LetThemKnow } from '../shared/LetThemKnow';
import { ReviewLine } from './ReviewLine';

export interface AddToListInput {
  mutationId: string;
  days: { day: string; title: string; recipeId?: string; servings?: number }[];
  lines: { id: string; text: string; quantity?: string; forRecipes?: string }[];
}

export interface AddToListSheetProps {
  opened: boolean;
  onClose: () => void;
  onAdd: (input: AddToListInput) => void;
  userId: string;
  plan: PlanDay[];
  today: string;
  recipes: Recipe[] | undefined;
  checkedAt: number | undefined;
  // The household's shopping lines, for the "you already have" hint.
  shoppingItems: ShoppingItem[];
}

const MAX_DAYS = 35;

interface Row {
  plan: PlanDay;
  title: string;
  recipe: Recipe | undefined;
  usable: boolean;
  checking: boolean;
  onList: boolean;
}

// The line's name as it is compared with the open shopping lines, so "Onions" and "2 onions" both match "onions".
const nameOf = (text: string): string => normaliseName(parseIngredientLine(text).name);

function Review({ onClose, onAdd, userId, plan, today, recipes, checkedAt, shoppingItems }: AddToListSheetProps) {
  const [initial] = useState<ReviewState>(() => readReview(userId) ?? { savedAt: Date.now(), included: {}, have: [], mutationId: crypto.randomUUID(), ids: {} });
  const [included, setIncluded] = useState<Record<string, boolean>>(initial.included);
  const [have, setHave] = useState<Set<string>>(() => new Set(initial.have));
  const mutationId = useRef(initial.mutationId);
  const ids = useRef<Record<string, string>>({ ...initial.ids });
  const sent = useRef(false);
  const [done, setDone] = useState(false);

  const rows: Row[] = useMemo(() => plan
    .filter(day => day.day >= today && day.meal !== undefined)
    .sort((a, b) => (a.day < b.day ? -1 : 1))
    .slice(0, MAX_DAYS)
    .map(day => {
      const state = recipeState(day, recipes, checkedAt);
      const recipe = state === 'found' ? recipes?.find(candidate => candidate.id === day.meal?.recipeId) : undefined;
      return {
        plan: day,
        title: displayTitle(day, recipes) ?? '',
        recipe,
        usable: recipe !== undefined && day.meal?.servings !== undefined,
        checking: state === 'checking',
        onList: day.addedAt !== undefined,
      };
    }), [plan, today, recipes, checkedAt]);

  // A day is on if the person switched it on, or if it has a usable recipe and is not already on the list.
  const isOn = (row: Row): boolean => row.usable && (included[row.plan.day] ?? !row.onList);
  const chosen = rows.filter(isOn);
  const lines = useMemo(
    () => buildLines(chosen.map((row): PlannedMeal => ({ recipe: row.recipe!, servings: row.plan.meal!.servings! }))),
    [rows, included], // eslint-disable-line react-hooks/exhaustive-deps
  );
  for (const line of lines) ids.current[line.key] ??= crypto.randomUUID();

  useEffect(() => {
    saveReview(userId, { savedAt: Date.now(), included, have: [...have], mutationId: mutationId.current, ids: ids.current });
  }, [userId, included, have, lines]);

  const open = new Set(shoppingItems.filter(item => item.deletedAt === undefined && !item.ticked).map(item => nameOf(item.text)));
  const count = lines.filter(line => !have.has(line.key)).length;
  const tooMany = count > MAX_LINES;

  function toggleHave(key: string): void {
    setHave(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function add(): void {
    if (sent.current || count === 0 || tooMany) return;
    sent.current = true;
    setDone(true);
    onAdd({
      mutationId: mutationId.current,
      days: chosen.map(row => ({ day: row.plan.day, title: row.plan.meal!.title, recipeId: row.plan.meal!.recipeId!, servings: row.plan.meal!.servings! })),
      lines: lines.filter(line => !have.has(line.key)).map(line => ({
        id: ids.current[line.key],
        text: line.text,
        forRecipes: line.forRecipes,
        ...(line.quantity === undefined ? {} : { quantity: line.quantity }),
      })),
    });
    clearReview(userId);
    onClose();
  }

  function cancel(): void {
    sent.current = true;
    clearReview(userId);
    onClose();
  }

  return (
    <Stack>
      <section>
        <Title order={3} size="h5" mb={4}>Days</Title>
        {rows.length === 0 ? <Text>There are no dinners planned from today on.</Text> : (
          <ul aria-label="Days" style={{ margin: 0, padding: 0 }}>
            {rows.map(row => (
              <li key={row.plan.day} style={{ listStyle: 'none', paddingBlock: 6 }}>
                <Group justify="space-between" align="center" wrap="nowrap" gap="sm">
                  <Stack gap={0} miw={0}>
                    <Text fw={600}>{dayHeading(row.plan.day)}</Text>
                    <Text style={{ overflowWrap: 'anywhere' }}>{row.title}</Text>
                    {row.checking && <Text size="sm">Checking the recipe…</Text>}
                    {!row.usable && !row.checking && <Text size="sm">No recipe</Text>}
                    {row.usable && row.onList && <Text size="sm">On the list</Text>}
                  </Stack>
                  <Switch
                    aria-label={`Include ${dayHeading(row.plan.day)}`}
                    label="Include"
                    checked={isOn(row)}
                    disabled={!row.usable}
                    onChange={event => { const checked = event.currentTarget.checked; setIncluded(current => ({ ...current, [row.plan.day]: checked })); }}
                  />
                </Group>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lines.length > 0 && (
        <section>
          <Title order={3} size="h5" mb={4}>Lines to add</Title>
          <ul aria-label="Lines to add" style={{ margin: 0, padding: 0 }}>
            {lines.map(line => (
              <ReviewLine key={line.key} line={line} have={have.has(line.key)} alreadyOnList={open.has(nameOf(line.text))} onToggle={() => toggleHave(line.key)} />
            ))}
          </ul>
        </section>
      )}

      {tooMany && <Alert color="honey">That's a lot for one go. Add some days now and the rest after.</Alert>}
      {count === 0 && <Text>Nothing needs adding.</Text>}
      <LetThemKnow />
      <Group gap="xs">
        {count > 0 && <Button onClick={add} disabled={done || tooMany}>{`Add ${count} ${count === 1 ? 'line' : 'lines'}`}</Button>}
        <Button variant="default" onClick={cancel}>Cancel</Button>
      </Group>
    </Stack>
  );
}

// Reviews what will go on the shopping list before anything is written. Its state is kept on the device for an hour.
export function AddToListSheet(props: AddToListSheetProps) {
  return (
    <ResponsiveSheet opened={props.opened} onClose={props.onClose} title="Add to shopping list">
      {props.opened && <Review {...props} />}
    </ResponsiveSheet>
  );
}
