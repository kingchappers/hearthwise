const HEADING = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const SHORT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const at = (day: string): Date => new Date(`${day}T12:00:00Z`);

// "Mon 16 Nov": a calendar date reads the same in every zone, so it is formatted in UTC.
export const dayHeading = (day: string): string => HEADING.format(at(day));

// The first two weeks are named, the rest by their Monday.
export function weekLabel(index: number, start: string): string {
  if (index === 0) return 'This week';
  if (index === 1) return 'Next week';
  return `Week of ${SHORT.format(at(start))}`;
}

// The cooking view, carrying the planned servings and the day the link came from. `day` is only where the link came from.
export function cookLink(recipeId: string, servings?: number, day?: string): string {
  const params = new URLSearchParams();
  if (servings !== undefined) params.set('servings', String(servings));
  if (day !== undefined) params.set('day', day);
  const query = params.toString();
  return `/recipes/${recipeId}${query === '' ? '' : `?${query}`}`;
}
