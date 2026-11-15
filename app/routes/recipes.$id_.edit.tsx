import { Anchor, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { Link, useNavigate, useParams } from 'react-router';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { LoadError } from '~/components/layout/LoadError';
import { RecipeForm } from '~/components/meals/RecipeForm';
import { RecipeMenu } from '~/components/meals/RecipeMenu';
import { useRecipeActions } from '~/hooks/useRecipeActions';
import { useHousehold } from '~/lib/household';
import { pageTitle } from '~/lib/pageTitle';
import { usePendingRecipeSaves, useRecipes } from '~/lib/recipes';
import type { Route } from './+types/recipes.$id_.edit';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Recipes') }];

function EditRecipeContent() {
  const { id = '' } = useParams();
  const household = useHousehold();
  const recipes = useRecipes();
  const actions = useRecipeActions();
  const pending = usePendingRecipeSaves();
  const navigate = useNavigate();

  const userId = household.data?.me.userId;
  // Drafts are kept under the person's id, so nothing is shown until it is known.
  if (!userId || recipes.status === 'loading') return <Group justify="center" py="xl" role="status" aria-label="Loading the recipe"><Loader /></Group>;
  if (recipes.status === 'error') return <LoadError thing="recipe" onRetry={recipes.refetch} />;

  const recipe = recipes.recipes.find(candidate => candidate.id === id);
  if (!recipe) {
    return (
      <Stack maw={640}>
        <Text>We couldn't find that recipe.</Text>
        <Anchor component={Link} to="/recipes">Back to Recipes</Anchor>
      </Stack>
    );
  }
  if (recipe.deletedAt !== undefined) {
    return (
      <Stack maw={640}>
        <Title order={1} size="h3">{recipe.title}</Title>
        <Text>This recipe was deleted.</Text>
        <Group>
          <Button onClick={() => actions.restore(recipe)}>Restore</Button>
          <Anchor component={Link} to="/recipes">Back to Recipes</Anchor>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack maw={640}>
      <Group justify="space-between" align="center" wrap="nowrap">
        <Title order={1} size="h3" style={{ overflowWrap: 'anywhere' }}>Edit recipe</Title>
        <RecipeMenu onDuplicate={() => actions.duplicate(recipe)} onDelete={() => actions.remove(recipe)} />
      </Group>
      <RecipeForm
        key={recipe.id}
        userId={userId}
        recipe={recipe}
        pendingIds={pending}
        onAdd={actions.add}
        onEdit={actions.edit}
        onDone={() => navigate('/recipes')}
        onDelete={() => actions.remove(recipe)}
      />
    </Stack>
  );
}

export default function EditRecipe() {
  return (
    <DefaultLayout>
      <EditRecipeContent />
    </DefaultLayout>
  );
}
