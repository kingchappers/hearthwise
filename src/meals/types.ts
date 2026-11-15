export type MealType = 'breakfast' | 'lunch' | 'dinner';

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];

export interface RecipeFieldTimes {
  title?: number;
  mealType?: number;
  servings?: number;
  minutes?: number;
  lowEnergy?: number;
  nutrition?: number;
  ingredients?: number;
  steps?: number;
}

export interface Recipe {
  id: string;
  title: string;
  mealType: MealType;
  servings: number;
  // Left out when not set.
  minutes?: number;
  lowEnergy: boolean;
  // Per serving, typed by hand. Left out when empty.
  nutrition?: string;
  // Lines as typed ("2 onions"). `parseIngredientLine` reads them whenever they are shown or scaled.
  ingredients: string[];
  steps: string[];
  fieldTimes: RecipeFieldTimes;
  createdBy: string;
  updatedAt: number;
  updatedBy: string;
  deletedAt?: number;
  deletedBy?: string;
  // Epoch seconds, when the store may purge a deleted recipe.
  expiresAt?: number;
}

// Each field carries the client time it was set, so an older write never overwrites a newer one.
export interface RecipeWrite {
  title?: { value: string; at: number };
  mealType?: { value: MealType; at: number };
  servings?: { value: number; at: number };
  // null clears the time.
  minutes?: { value: number | null; at: number };
  lowEnergy?: { value: boolean; at: number };
  // An empty string clears the note.
  nutrition?: { value: string; at: number };
  ingredients?: { value: string[]; at: number };
  steps?: { value: string[]; at: number };
}

export interface PlanMeal {
  recipeId?: string;
  title: string;
  // Present only when recipeId is. Fixed when the day is set.
  servings?: number;
}

export interface PlanDay {
  // YYYY-MM-DD in the household's time zone.
  day: string;
  // Left out when the day is cleared; fieldTimes.meal stays.
  meal?: PlanMeal;
  fieldTimes: { meal?: number };
  // Display only: the day's dinner was added to the shopping list.
  addedAt?: number;
  addedBy?: string;
  updatedAt: number;
  updatedBy: string;
  // Epoch seconds: the day's date plus 60 days.
  expiresAt: number;
}

export interface RecipesData {
  recipes: Recipe[];
  serverTime: number;
}

export interface PlanData {
  days: PlanDay[];
  serverTime: number;
}
