// How far away a day is, in words, for people who find it hard to feel how far off a date is ("in 2 days"). Only for days still to come:
// a day that has passed gets no word, because a count of days gone by reads as lateness. Exact dates stay beside it; this only adds.
const DAY_MS = 86_400_000;
const FAR = 60;

const at = (day: string): number => Date.parse(`${day}T00:00:00Z`);

export function relativeDayText(day: string, today: string): string | undefined {
  const days = Math.round((at(day) - at(today)) / DAY_MS);
  if (days < 0 || days > FAR) return undefined;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

// "Sat 5 Dec (in 2 days)" when the person asked for it and the day is still to come; the exact text on its own otherwise.
export function withRelative(text: string, day: string | undefined, today: string, on: boolean): string {
  if (!on || day === undefined) return text;
  const relative = relativeDayText(day, today);
  return relative === undefined ? text : `${text} (${relative})`;
}
