import { Stack, Title } from '@mantine/core';
import { useNavigate } from 'react-router';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { RecipeForm } from '~/components/meals/RecipeForm';
import { useRecipeActions } from '~/hooks/useRecipeActions';
import { useHousehold } from '~/lib/household';
import { pageTitle } from '~/lib/pageTitle';
import { usePendingRecipeSaves } from '~/lib/recipes';
import type { Route } from './+types/recipes.new';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Recipes') }];

function NewRecipeContent() {
  const household = useHousehold();
  const actions = useRecipeActions();
  const pending = usePendingRecipeSaves();
  const navigate = useNavigate();
  return (
    <Stack maw={640}>
      <Title order={1} size="h3">New recipe</Title>
      <RecipeForm userId={household.data?.me.userId ?? ''} pendingIds={pending} onAdd={actions.add} onEdit={actions.edit} onDone={() => navigate('/recipes')} />
    </Stack>
  );
}

export default function NewRecipe() {
  return (
    <DefaultLayout>
      <NewRecipeContent />
    </DefaultLayout>
  );
}
