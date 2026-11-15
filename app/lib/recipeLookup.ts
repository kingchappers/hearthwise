import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Recipe } from '../../src/meals/types';
import { RECIPES_KEY } from './recipeKeys';
import type { RecipesState } from './recipes';

export type LookupState = 'found' | 'deleted' | 'checking' | 'gone';

// Whether a recipe is there. The client never decides "gone" from absence alone: the list may not have loaded, or may predate a recipe
// the other phone made. `fetchedAt` is when a refetch made for this check last finished well, or undefined if none has.
export function lookupState(recipeId: string, recipes: Recipe[] | undefined, fetchedAt: number | undefined): LookupState {
  const found = recipes?.find(recipe => recipe.id === recipeId);
  if (found) return found.deletedAt === undefined ? 'found' : 'deleted';
  return recipes !== undefined && fetchedAt !== undefined ? 'gone' : 'checking';
}

// When a recipe is missing from the cache, refetches the list once for this mount. Returns the time of the first successful answer after
// mounting, or undefined while none has arrived (still loading, or offline), so a missing recipe keeps saying "checking" and not "gone".
// A later refetch, such as the one when the app is brought to the front, counts too.
export function useRecipeCheck(recipes: RecipesState, missing: boolean): number | undefined {
  const client = useQueryClient();
  const mountedAt = useRef(Date.now());
  const asked = useRef(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!missing || asked.current) return;
    asked.current = true;
    void client.refetchQueries({ queryKey: RECIPES_KEY }).then(() => setTick(tick => tick + 1));
  }, [client, missing]);

  const updatedAt = recipes.dataUpdatedAt;
  return updatedAt !== undefined && updatedAt >= mountedAt.current && client.getQueryState(RECIPES_KEY)?.status === 'success' ? updatedAt : undefined;
}
