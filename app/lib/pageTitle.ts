export const APP_NAME = 'Hearthwise';
export const APP_DESCRIPTION = 'A shared household app for chores, to-dos and the shopping list.';

export function pageTitle(...parts: string[]): string {
  return [...parts.filter(part => part !== ''), APP_NAME].join(' – ');
}
