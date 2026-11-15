import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router';
import type { Recipe } from '../../src/meals/types';
import { ToastAction } from '~/components/layout/ToastAction';
import { useHousehold } from '~/lib/household';
import { useMealMutation } from '~/lib/mutations';
import type { NewRecipe } from '~/lib/mutations';
import { usePreferences } from '~/lib/preferences';
import type { RecipeChanges } from '~/lib/recipeFields';
import { undoAutoClose } from '~/lib/undoDuration';

export interface RecipeActions {
  add(recipe: NewRecipe): void;
  // Takes only the fields that changed.
  edit(recipe: Recipe, changes: RecipeChanges): void;
  remove(recipe: Recipe): void;
  restore(recipe: Recipe): void;
  duplicate(recipe: Recipe): void;
}

const COPY_SUFFIX = ' (copy)';
const MAX_TITLE = 120;

// Every recipe action the screens can take: each builds its mutation's variables (an id, the time of the tap, who made it) and runs it
// by key. Recipe writes never carry "Let them know": recipes are not something to tell the other person about.
export function useRecipeActions(): RecipeActions {
  const household = useHousehold();
  const [preferences] = usePreferences();
  const navigate = useNavigate();
  const add = useMealMutation('recipeAdd');
  const edit = useMealMutation('recipeEdit');
  const del = useMealMutation('recipeDelete');
  const restore = useMealMutation('recipeRestore');

  const by = household.data?.me.userId ?? '';
  const common = () => ({ mutationId: crypto.randomUUID(), at: Date.now(), by });

  function toast(text: string, undo?: () => void): void {
    const id = crypto.randomUUID();
    notifications.show({
      id,
      autoClose: undo ? undoAutoClose(preferences.undoDuration) : 5000,
      message: undo ? <ToastAction text={text} actionLabel="Undo" onAction={() => { notifications.hide(id); undo(); }} /> : text,
    });
  }

  return {
    add: recipe => add.mutate({ ...common(), recipe }),

    edit: (recipe, changes) => {
      if (Object.keys(changes).length === 0) return;
      edit.mutate({ ...common(), recipeId: recipe.id, changes });
    },

    remove: recipe => {
      del.mutate({ ...common(), recipeId: recipe.id });
      toast(`Deleted: ${recipe.title}`, () => restore.mutate({ ...common(), recipeIds: [recipe.id] }));
      navigate('/recipes');
    },

    restore: recipe => {
      restore.mutate({ ...common(), recipeIds: [recipe.id] });
      toast(`Restored: ${recipe.title}`);
    },

    // A copy is saved at once, so it exists before the editor opens, and the title is cut so " (copy)" still fits within the limit.
    duplicate: recipe => {
      const id = crypto.randomUUID();
      const title = `${Array.from(recipe.title).slice(0, MAX_TITLE - COPY_SUFFIX.length).join('')}${COPY_SUFFIX}`;
      add.mutate({
        ...common(),
        recipe: {
          id, title, mealType: recipe.mealType, servings: recipe.servings, lowEnergy: recipe.lowEnergy, ingredients: [...recipe.ingredients], steps: [...recipe.steps],
          ...(recipe.minutes === undefined ? {} : { minutes: recipe.minutes }),
          ...(recipe.nutrition === undefined ? {} : { nutrition: recipe.nutrition }),
        },
      });
      navigate(`/recipes/${id}/edit`);
    },
  };
}
