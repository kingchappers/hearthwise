import { Checkbox, Group, NativeSelect, TextInput } from '@mantine/core';
import type { MealType } from '../../../src/meals/types';
import type { RecipeFilter } from '~/lib/recipes';

export const TIME_CHOICES = [10, 20, 30, 45, 60] as const;

export interface RecipeFiltersProps {
  value: RecipeFilter;
  onChange: (value: RecipeFilter) => void;
}

// A filter with nothing chosen leaves its key out, so an empty filter is `{}`.
function without(value: RecipeFilter, key: keyof RecipeFilter): RecipeFilter {
  const next = { ...value };
  delete next[key];
  return next;
}

export function RecipeFilters({ value, onChange }: RecipeFiltersProps) {
  return (
    <Group align="flex-end" gap="xs" wrap="wrap">
      <TextInput
        style={{ flex: '1 1 200px' }}
        label="Search recipes"
        value={value.search ?? ''}
        onChange={event => onChange(event.currentTarget.value === '' ? without(value, 'search') : { ...value, search: event.currentTarget.value })}
        autoComplete="off"
      />
      <NativeSelect
        label="Meal"
        value={value.mealType ?? 'all'}
        data={[{ value: 'all', label: 'All' }, { value: 'breakfast', label: 'Breakfast' }, { value: 'lunch', label: 'Lunch' }, { value: 'dinner', label: 'Dinner' }]}
        onChange={event => onChange(event.currentTarget.value === 'all' ? without(value, 'mealType') : { ...value, mealType: event.currentTarget.value as MealType })}
      />
      <NativeSelect
        label="Time"
        value={String(value.maxMinutes ?? 'any')}
        data={[{ value: 'any', label: 'Any time' }, ...TIME_CHOICES.map(minutes => ({ value: String(minutes), label: `Up to ${minutes} min` }))]}
        onChange={event => onChange(event.currentTarget.value === 'any' ? without(value, 'maxMinutes') : { ...value, maxMinutes: Number(event.currentTarget.value) })}
      />
      <Checkbox
        label="Low energy"
        checked={value.lowEnergy === true}
        onChange={event => onChange(event.currentTarget.checked ? { ...value, lowEnergy: true } : without(value, 'lowEnergy'))}
        pb={8}
      />
    </Group>
  );
}
