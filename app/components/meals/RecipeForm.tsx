import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Group, NativeSelect, NumberInput, Stack, Text, TextInput } from '@mantine/core';
import type { MealType, Recipe } from '../../../src/meals/types';
import { MAX_MINUTES, MAX_SERVINGS } from '../../../src/shared/mealValidation';
import type { NewRecipe } from '~/lib/mutations';
import { NEW_DRAFT, readDraft, removeDraft, saveDraft } from '~/lib/recipeDraft';
import type { RecipeDraft } from '~/lib/recipeDraft';
import { changedFields, checkLimits, cleanLines, EMPTY_FIELDS, fieldsFromRecipe } from '~/lib/recipeFields';
import type { RecipeChanges, RecipeFields } from '~/lib/recipeFields';
import { IngredientLines } from './IngredientLines';
import { StepsEditor } from './StepsEditor';

export interface RecipeFormProps {
  userId: string;
  // Present when editing.
  recipe?: Recipe;
  // Recipe ids that have a save waiting in the queue. A draft for one of them is not offered.
  pendingIds: ReadonlySet<string>;
  onAdd: (recipe: NewRecipe) => void;
  onEdit: (recipe: Recipe, changes: RecipeChanges) => void;
  onDone: () => void;
  onDelete?: () => void;
}

const DRAFT_SAVE_MS = 3000;

type Errors = Partial<Record<'title' | 'servings' | 'minutes' | 'nutrition' | 'ingredients' | 'steps', string>>;

const isWhole = (value: number, min: number, max: number): boolean => Number.isInteger(value) && value >= min && value <= max;

// What is wrong with the form, field by field. The text is never cut short: a recipe over a limit is not saved.
function validate(fields: RecipeFields): { errors: Errors; messages: string[] } {
  const errors: Errors = {};
  const messages: string[] = [];
  if (fields.title.trim() === '') errors.title = 'A recipe needs a title.';
  if (!isWhole(fields.servings, 1, MAX_SERVINGS)) errors.servings = `Servings can be a whole number from 1 to ${MAX_SERVINGS}.`;
  if (fields.minutes !== null && !isWhole(fields.minutes, 1, MAX_MINUTES)) errors.minutes = `Minutes can be a whole number from 1 to ${MAX_MINUTES}, or empty.`;
  for (const problem of checkLimits(fields)) {
    errors[problem.field] ??= problem.message;
    messages.push(problem.message);
  }
  return { errors, messages };
}

function toNewRecipe(id: string, fields: RecipeFields): NewRecipe {
  return {
    id,
    title: fields.title.trim(),
    mealType: fields.mealType,
    servings: fields.servings,
    lowEnergy: fields.lowEnergy,
    ingredients: cleanLines(fields.ingredients),
    steps: cleanLines(fields.steps),
    ...(fields.minutes === null ? {} : { minutes: fields.minutes }),
    ...(fields.nutrition.trim() === '' ? {} : { nutrition: fields.nutrition.trim() }),
  };
}

export function RecipeForm({ userId, recipe, pendingIds, onAdd, onEdit, onDone, onDelete }: RecipeFormProps) {
  const draftKey = recipe?.id ?? NEW_DRAFT;
  const [initialBase] = useState<RecipeFields>(() => (recipe ? fieldsFromRecipe(recipe) : EMPTY_FIELDS));
  const [offered, setOffered] = useState<RecipeDraft | undefined>(() => {
    const found = readDraft(userId, draftKey);
    return found && (!pendingIds.has(found.recipeId) || found.refused !== undefined) ? found : undefined;
  });
  const [base, setBase] = useState<RecipeFields>(initialBase);
  const [fields, setFields] = useState<RecipeFields>(initialBase);
  const [recipeId, setRecipeId] = useState<string>(() => recipe?.id ?? crypto.randomUUID());
  const [errors, setErrors] = useState<Errors>({});
  const [messages, setMessages] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // The latest values, for the timer and the page-hidden handler.
  const latest = useRef({ base, fields, recipeId, offered });
  latest.current = { base, fields, recipeId, offered };
  const finished = useRef(false);

  const set = <K extends keyof RecipeFields>(key: K, value: RecipeFields[K]): void => setFields(current => ({ ...current, [key]: value }));

  useEffect(() => {
    // Nothing is saved while the offer of an older draft is open, or for a form nobody has touched.
    function saveNow(): void {
      const { base: from, fields: current, recipeId: id, offered: open } = latest.current;
      if (finished.current || open) return;
      if (Object.keys(changedFields(from, current)).length === 0) return;
      saveDraft(userId, draftKey, { recipeId: id, base: from, fields: current });
    }
    const timer = window.setInterval(saveNow, DRAFT_SAVE_MS);
    const onHidden = (): void => { if (document.visibilityState === 'hidden') saveNow(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', saveNow);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', saveNow);
      saveNow();
    };
  }, [userId, draftKey]);

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    const found = validate(fields);
    setErrors(found.errors);
    setMessages(found.messages);
    if (Object.keys(found.errors).length > 0) {
      // Takes the person to the first field that needs a look, once the errors are drawn.
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }

    // The draft stays until the server accepts the save: the registered mutation removes it, even after a reload.
    if (recipe) {
      const changes = changedFields(base, fields);
      if (Object.keys(changes).length > 0) {
        saveDraft(userId, draftKey, { recipeId, base, fields });
        onEdit(recipe, changes);
      } else {
        removeDraft(userId, draftKey);
      }
    } else {
      saveDraft(userId, draftKey, { recipeId, base, fields });
      onAdd(toNewRecipe(recipeId, fields));
    }
    finished.current = true;
    onDone();
  }

  // Leaving keeps what was typed as a draft (the page does the same on Back), so this never throws work away.
  const touched = Object.keys(changedFields(base, fields)).length > 0;
  function leave(): void {
    if (touched) saveDraft(userId, draftKey, { recipeId, base, fields });
    finished.current = true;
    onDone();
  }

  function continueDraft(): void {
    if (!offered) return;
    setBase(offered.base);
    setFields(offered.fields);
    setRecipeId(offered.recipeId);
    setOffered(undefined);
  }

  function startAgain(): void {
    removeDraft(userId, draftKey);
    setOffered(undefined);
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate>
      <Stack maw={640}>
        {offered && (
          <Alert color="honey" title="You have an unsaved draft of this recipe">
            {offered.refused && <Text mb="xs">{offered.refused}</Text>}
            <Group gap="xs">
              <Button onClick={continueDraft}>Continue your draft</Button>
              <Button variant="default" onClick={startAgain}>Throw away the draft</Button>
            </Group>
          </Alert>
        )}
        {messages.length > 0 && (
          <Alert color="honey" title="This recipe is over a limit" role="alert">
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {messages.map(message => <li key={message}>{message}</li>)}
            </ul>
          </Alert>
        )}
        <TextInput label="Title" value={fields.title} onChange={event => set('title', event.currentTarget.value)} error={errors.title} autoComplete="off" />
        <Group align="flex-start" gap="sm" wrap="wrap">
          <NativeSelect
            label="Meal"
            value={fields.mealType}
            data={[{ value: 'breakfast', label: 'Breakfast' }, { value: 'lunch', label: 'Lunch' }, { value: 'dinner', label: 'Dinner' }]}
            onChange={event => set('mealType', event.currentTarget.value as MealType)}
          />
          <NumberInput
            label="Servings"
            value={fields.servings || ''}
            onChange={value => set('servings', value === '' ? 0 : Number(value))}
            allowDecimal={false}
            allowNegative={false}
            hideControls
            inputMode="numeric"
            w={110}
            error={errors.servings}
          />
          <NumberInput
            label="Minutes (optional)"
            value={fields.minutes ?? ''}
            onChange={value => set('minutes', value === '' ? null : Number(value))}
            allowDecimal={false}
            allowNegative={false}
            hideControls
            inputMode="numeric"
            w={150}
            error={errors.minutes}
          />
        </Group>
        <Checkbox
          label="Low energy"
          description="Easy to make when you are short of time, energy or ingredients."
          checked={fields.lowEnergy}
          onChange={event => set('lowEnergy', event.currentTarget.checked)}
        />
        <TextInput
          label="Nutrition per serving (optional)"
          description="Typed in by hand, for example 450 kcal, 20 g protein."
          value={fields.nutrition}
          onChange={event => set('nutrition', event.currentTarget.value)}
          error={errors.nutrition}
          autoComplete="off"
        />
        <IngredientLines value={fields.ingredients} onChange={value => set('ingredients', value)} error={errors.ingredients} />
        <StepsEditor value={fields.steps} onChange={value => set('steps', value)} error={errors.steps} />
        <Group gap="xs">
          <Button type="submit">Save</Button>
          <Button variant="default" onClick={leave}>{touched ? 'Leave and keep my draft' : 'Cancel'}</Button>
        </Group>
        {onDelete && (
          <Stack gap="xs" pt="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            {!confirmingDelete && <Group><Button variant="subtle" onClick={() => setConfirmingDelete(true)}>Delete this recipe</Button></Group>}
            {confirmingDelete && (
              <>
                <Text role="alert">Delete this recipe? You can bring it back from Deleted for 30 days.</Text>
                <Group gap="xs">
                  <Button variant="default" onClick={onDelete}>Delete it</Button>
                  <Button variant="default" onClick={() => setConfirmingDelete(false)}>Keep it</Button>
                </Group>
              </>
            )}
          </Stack>
        )}
      </Stack>
    </form>
  );
}
