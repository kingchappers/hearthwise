// A half-typed recipe, kept on this device so a sleeping phone does not lose it, and so a refused save is not lost either. Drafts are
// removed only after the server accepts the save. A new recipe's draft lives under the fixed key `new`, and holds the id the editor made.
import { readObject, recipeDraftKey, writeObject } from './deviceKeys';
import type { RecipeFields } from './recipeFields';

export const NEW_DRAFT = 'new';

export interface RecipeDraft {
  recipeId: string;
  // The recipe as it was when the editor opened (empty for a new one). A save sends the fields that differ from it.
  base: RecipeFields;
  fields: RecipeFields;
  // Why the server refused the save, in plain words.
  refused?: string;
}

const isDraft = (value: unknown): value is RecipeDraft =>
  typeof value === 'object' && value !== null && typeof (value as RecipeDraft).recipeId === 'string' && 'fields' in value && 'base' in value;

export function readDraft(userId: string, recipeId: string): RecipeDraft | undefined {
  const draft = readObject(recipeDraftKey(userId))[recipeId];
  return isDraft(draft) ? draft : undefined;
}

export function saveDraft(userId: string, recipeId: string, draft: RecipeDraft): void {
  writeObject(recipeDraftKey(userId), { ...readObject(recipeDraftKey(userId)), [recipeId]: draft });
}

export function removeDraft(userId: string, recipeId: string): void {
  const all = readObject(recipeDraftKey(userId));
  if (!(recipeId in all)) return;
  delete all[recipeId];
  writeObject(recipeDraftKey(userId), all);
}

// The draft a refusal is about: stored under the recipe's id, or under `new` when it holds that id.
export function markRefused(userId: string, recipeId: string, message: string): void {
  const all = readObject(recipeDraftKey(userId));
  const key = isDraft(all[recipeId]) ? recipeId : isDraft(all[NEW_DRAFT]) && (all[NEW_DRAFT] as RecipeDraft).recipeId === recipeId ? NEW_DRAFT : undefined;
  if (key === undefined) return;
  writeObject(recipeDraftKey(userId), { ...all, [key]: { ...(all[key] as RecipeDraft), refused: message } });
}
