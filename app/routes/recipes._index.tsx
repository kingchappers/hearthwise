import { useState } from 'react';
import { Button, Group, Loader, Stack, Title } from '@mantine/core';
import { Link } from 'react-router';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { LoadError } from '~/components/layout/LoadError';
import { RecipeFilters } from '~/components/meals/RecipeFilters';
import { RecipeList } from '~/components/meals/RecipeList';
import { pageTitle } from '~/lib/pageTitle';
import { filterRecipes, sortRecipes, useRecipes } from '~/lib/recipes';
import type { RecipeFilter } from '~/lib/recipes';
import type { Route } from './+types/recipes._index';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Recipes') }];

function RecipesContent() {
  const recipes = useRecipes();
  const [filter, setFilter] = useState<RecipeFilter>({});

  if (recipes.status === 'loading') return <Group justify="center" py="xl" role="status" aria-label="Loading recipes"><Loader /></Group>;
  if (recipes.status === 'error') return <LoadError thing="recipes" onRetry={recipes.refetch} />;

  return (
    <Stack maw={640}>
      <Group justify="space-between" align="center">
        <Title order={1} size="h3">Recipes</Title>
        <Button component={Link} to="/recipes/new">New recipe</Button>
      </Group>
      <RecipeFilters value={filter} onChange={setFilter} />
      <RecipeList recipes={sortRecipes(filterRecipes(recipes.recipes, filter))} filtered={Object.keys(filter).length > 0} />
    </Stack>
  );
}

export default function Recipes() {
  return (
    <DefaultLayout>
      <RecipesContent />
    </DefaultLayout>
  );
}
