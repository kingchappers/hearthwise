// A whole hour, 0 to 23, written as a clock time: the options of every hour picker.
export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({ value: String(hour), label: `${String(hour).padStart(2, '0')}:00` }));

// Quiet hours may run past midnight (22 to 7). The same start and end means none.
export function isInQuietHours(hour: number, quiet: { start: number; end: number } | null): boolean {
  if (quiet === null || quiet.start === quiet.end) return false;
  return quiet.start < quiet.end ? hour >= quiet.start && hour < quiet.end : hour >= quiet.start || hour < quiet.end;
}
