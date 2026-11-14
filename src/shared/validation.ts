import { isValidTimeZone } from '../api/dates';
import type { HourSetting, MemberSettingsPatch } from './household';

// One validator per request field. A failure names the field, so the API can answer 400 { error: 'invalid', field }.
export type Parsed<T> = { ok: true; value: T } | { ok: false; field: string };

export const good = <T>(value: T): Parsed<T> => ({ ok: true, value });
export const bad = (field: string): Parsed<never> => ({ ok: false, field });

const MAX_DISPLAY_NAME = 40;
const MAX_HOUSEHOLD_NAME = 60;
// 32 random bytes as base64url, no padding.
const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function trimmedText(value: unknown, max: number, field: string): Parsed<string> {
  if (typeof value !== 'string') return bad(field);
  const text = value.trim();
  // Code points, not UTF-16 units, so an emoji counts as one character.
  const length = Array.from(text).length;
  return length >= 1 && length <= max ? good(text) : bad(field);
}

export const parseDisplayName = (value: unknown): Parsed<string> => trimmedText(value, MAX_DISPLAY_NAME, 'displayName');
export const parseHouseholdName = (value: unknown): Parsed<string> => trimmedText(value, MAX_HOUSEHOLD_NAME, 'name');

export function parseTimeZoneField(value: unknown): Parsed<string> {
  return isValidTimeZone(value) ? good(value) : bad('timezone');
}

export function parseInviteToken(value: unknown): Parsed<string> {
  return typeof value === 'string' && INVITE_TOKEN.test(value) ? good(value) : bad('token');
}

// Every household write must carry one, so a replay can be told from a new write.
export function parseRequiredMutationId(value: unknown): Parsed<string> {
  return typeof value === 'string' && UUID.test(value) ? good(value) : bad('mutationId');
}

export function parseMutationId(value: unknown): Parsed<string | undefined> {
  if (value === undefined) return good(undefined);
  return typeof value === 'string' && UUID.test(value) ? good(value) : bad('mutationId');
}

export const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isHour = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 23;

// The first key that is not allowed, as a dotted field path ("settings.colour"), or just the key at the top level.
export function unknownKey(value: Record<string, unknown>, allowed: string[], path: string): string | undefined {
  const extra = Object.keys(value).find(key => !allowed.includes(key));
  if (extra === undefined) return undefined;
  return path === '' ? extra : `${path}.${extra}`;
}

function parseHourSetting(value: unknown, path: string): Parsed<Partial<HourSetting>> {
  if (!isObject(value)) return bad(path);
  const extra = unknownKey(value, ['on', 'hour'], path);
  if (extra) return bad(extra);
  const result: Partial<HourSetting> = {};
  if ('on' in value) {
    if (typeof value.on !== 'boolean') return bad(`${path}.on`);
    result.on = value.on;
  }
  if ('hour' in value) {
    if (!isHour(value.hour)) return bad(`${path}.hour`);
    result.hour = value.hour;
  }
  return good(result);
}

function parseQuietHours(value: unknown): Parsed<{ start: number; end: number } | null> {
  const path = 'settings.quietHours';
  if (value === null) return good(null);
  if (!isObject(value) || !('start' in value) || !('end' in value)) return bad(path);
  const extra = unknownKey(value, ['start', 'end'], path);
  if (extra) return bad(extra);
  if (!isHour(value.start)) return bad(`${path}.start`);
  if (!isHour(value.end)) return bad(`${path}.end`);
  return good({ start: value.start, end: value.end });
}

function parseSettingsPatch(value: unknown): Parsed<MemberSettingsPatch> {
  if (!isObject(value)) return bad('settings');
  const extra = unknownKey(value, ['digest', 'dueNudges', 'quietHours', 'defaultView'], 'settings');
  if (extra) return bad(extra);

  const result: MemberSettingsPatch = {};
  for (const key of ['digest', 'dueNudges'] as const) {
    if (!(key in value)) continue;
    const parsed = parseHourSetting(value[key], `settings.${key}`);
    if (!parsed.ok) return parsed;
    result[key] = parsed.value;
  }
  if ('quietHours' in value) {
    const parsed = parseQuietHours(value.quietHours);
    if (!parsed.ok) return parsed;
    result.quietHours = parsed.value;
  }
  if ('defaultView' in value) {
    if (value.defaultView !== 'list' && value.defaultView !== 'next') return bad('settings.defaultView');
    result.defaultView = value.defaultView;
  }
  return good(result);
}

// The body of PATCH /api/hh/members/me. An optional mutationId may travel with it; it is not part of the patch.
export function parseMemberPatch(body: Record<string, unknown>): Parsed<{ displayName?: string; settings?: MemberSettingsPatch }> {
  const extra = unknownKey(body, ['displayName', 'settings', 'mutationId'], '');
  if (extra) return bad(extra);

  const patch: { displayName?: string; settings?: MemberSettingsPatch } = {};
  if ('displayName' in body) {
    const parsed = parseDisplayName(body.displayName);
    if (!parsed.ok) return parsed;
    patch.displayName = parsed.value;
  }
  if ('settings' in body) {
    const parsed = parseSettingsPatch(body.settings);
    if (!parsed.ok) return parsed;
    patch.settings = parsed.value;
  }
  return Object.keys(patch).length === 0 ? bad('body') : good(patch);
}
