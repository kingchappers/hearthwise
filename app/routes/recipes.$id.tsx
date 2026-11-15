import { Anchor, Group, Loader, Stack, Text } from '@mantine/core';
import { Link, useParams, useSearchParams } from 'react-router';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { LoadError } from '~/components/layout/LoadError';
import { CookingView } from '~/components/meals/CookingView';
import { RecipeMenu } from '~/components/meals/RecipeMenu';
import { useRecipeActions } from '~/hooks/useRecipeActions';
import { useHousehold } from '~/lib/household';
import { pageTitle } from '~/lib/pageTitle';
import { lookupState, useRecipeCheck } from '~/lib/recipeLookup';
import { useRecipes } from '~/lib/recipes';
import type { Route } from './+types/recipes.$id';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Recipes') }];

// The servings the link carries, if they are a whole number from 1 to 50. Anything else is ignored.
function plannedServings(value: string | null): number | undefined {
  if (value === null || !/^\d+$/.test(value)) return undefined;
  const servings = Number(value);
  return servings >= 1 && servings <= 50 ? servings : undefined;
}

function RecipeContent() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
  const household = useHousehold();
  const recipes = useRecipes();
  const actions = useRecipeActions();
  const ready = recipes.status === 'ready';
  const recipe = recipes.recipes.find(candidate => candidate.id === id);
  const checkedAt = useRecipeCheck(recipes, ready && !recipe);
  const userId = household.data?.me.userId;

  if (!userId || recipes.status === 'loading') return <Group justify="center" py="xl" role="status" aria-label="Loading the recipe"><Loader /></Group>;
  if (recipes.status === 'error') return <LoadError thing="recipe" onRetry={recipes.refetch} />;

  const state = lookupState(id, recipes.recipes, checkedAt);
  if (!recipe || state === 'checking' || state === 'gone') {
    return (
      <Stack maw={640}>
        {state === 'gone' ? <Text>This recipe is gone</Text> : <Text role="status">Checking the recipe…</Text>}
        {state === 'gone' && <Anchor component={Link} to="/recipes">Back to Recipes</Anchor>}
      </Stack>
    );
  }

  const deleted = recipe.deletedAt !== undefined;
  return (
    <Stack maw={640}>
      {!deleted && (
        <Group justify="flex-end">
          <RecipeMenu editHref={`/recipes/${recipe.id}/edit`} onDuplicate={() => actions.duplicate(recipe)} onDelete={() => actions.remove(recipe)} />
        </Group>
      )}
      <CookingView key={recipe.id} recipe={recipe} userId={userId} plannedServings={plannedServings(search.get('servings'))} readOnly={deleted} onRestore={() => actions.restore(recipe)} />
    </Stack>
  );
}

export default function Recipe() {
  return (
    <DefaultLayout>
      <RecipeContent />
    </DefaultLayout>
  );
}
