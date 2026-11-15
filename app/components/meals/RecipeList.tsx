import { Badge, Group, Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import type { Recipe } from '../../../src/meals/types';

export interface RecipeListProps {
  recipes: Recipe[];
  // Whether a filter is set, so an empty list can say why.
  filtered: boolean;
  // Where a row goes. By default, to the recipe's cooking view.
  hrefFor?: (recipe: Recipe) => string;
}

export function RecipeList({ recipes, filtered, hrefFor = recipe => `/recipes/${recipe.id}` }: RecipeListProps) {
  if (recipes.length === 0) {
    return filtered
      ? <Text>No recipes match.</Text>
      : (
        <Stack gap={4}>
          <Text>No recipes yet.</Text>
          <Text size="sm">Add the first one with New recipe.</Text>
        </Stack>
      );
  }
  return (
    <ul style={{ margin: 0, padding: 0 }}>
      {recipes.map(recipe => (
        <li key={recipe.id} style={{ listStyle: 'none' }}>
          <Link to={hrefFor(recipe)} style={{ display: 'block', minHeight: 44, paddingBlock: 8, color: 'inherit', textDecoration: 'none' }}>
            <Group justify="space-between" wrap="nowrap" gap="sm">
              <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{recipe.title}</Text>
              <Group gap={6} wrap="nowrap">
                {recipe.minutes !== undefined && <Text size="sm">{`${recipe.minutes} min`}</Text>}
                {recipe.lowEnergy && <Badge variant="light" color="gray" tt="none">Low energy</Badge>}
              </Group>
            </Group>
          </Link>
        </li>
      ))}
    </ul>
  );
}
