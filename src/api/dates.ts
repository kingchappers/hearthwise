const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TIME_ZONE_LENGTH = 64;
const CLOCK_SKEW_ALLOWANCE_MS = 5 * 60 * 1000;

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  // `new Date` rolls an out-of-range day/month over into the next one
  // (2026-02-31 silently becomes 2026-03-03) rather than rejecting it, so
  // round-trip through ISO formatting and require it to match verbatim.
  return date.toISOString().slice(0, 10) === value;
}

export function isValidTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value === '' || value.length > MAX_TIME_ZONE_LENGTH) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// A phone's clock can run fast, and a fast timestamp would win every field conflict. Cap it at server time plus five minutes.
// A non-finite timestamp would serialise as null, so it is refused here instead of being stored.
export function clampClientTime(clientMs: number, serverMs: number): number {
  if (!Number.isFinite(clientMs)) throw new RangeError('client timestamp must be a finite number');
  return Math.min(clientMs, serverMs + CLOCK_SKEW_ALLOWANCE_MS);
}
