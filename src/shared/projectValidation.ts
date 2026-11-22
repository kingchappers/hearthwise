import { isEnergy } from './energy';
import type { MaterialWrite, PlannedValue, ProjectStatus, ProjectWrite, Stamped, StepState, StepWrite } from '../projects/types';
import { MAX_PENCE } from './money';
import { ID_PATTERN, MAX_POSITION, POSITION_ALPHABET } from './projectRules';
import { addDays, isRealDate } from './schedule';
import { ENVELOPE_KEYS, parseClientTime, parseEnvelope, parseStamped, parseUuid } from './taskValidation';
import { bad, good, trimmedText, unknownKey } from './validation';
import type { Parsed } from './validation';

export const MAX_PROJECT_TITLE = 80;
export const MAX_PROJECT_NOTES = 1000;
export const MAX_STEP_TEXT = 120;
export const MAX_STEP_NOTE = 500;
export const MAX_MATERIAL_TEXT = 120;
export const MAX_ADD_MATERIALS = 60;

const PROJECT_FIELD_KEYS = ['title', 'notes', 'status', 'ordered'];
const STEP_FIELD_KEYS = ['text', 'note', 'energy', 'state', 'position'];

export const parseId = (value: unknown, field: string): Parsed<string> => (typeof value === 'string' && ID_PATTERN.test(value) ? good(value) : bad(field));

// Text is trimmed and refused, never cut, when it is over its limit. `null` clears an optional text field.
const optionalText = (max: number, field: string) => (value: unknown): Parsed<string | null> => (value === null ? good(null) : trimmedText(value, max, field));

function parsePosition(value: unknown): Parsed<string> {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_POSITION) return bad('position');
  for (const char of value) if (!POSITION_ALPHABET.includes(char)) return bad('position');
  return good(value);
}

const oneOf = <T extends string>(allowed: readonly T[], field: string) => (value: unknown): Parsed<T> => (allowed.includes(value as T) ? good(value as T) : bad(field));

type Put<W> = Parsed<{ write: W; mutationId: string; clientAt?: number }>;

// Reads each named field with its time. A time with no field to go with it is a mistake, and so is a write with no fields.
function parseWrite<W>(body: Record<string, unknown>, keys: string[], parsers: Record<string, (value: unknown) => Parsed<unknown>>, allowEmpty = false): Put<W> {
  const extra = unknownKey(body, [...keys, ...keys.map(key => `${key}At`), ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  const write: Record<string, unknown> = {};
  for (const key of keys) {
    const parsed = parseStamped(body, key, parsers[key]);
    if (!parsed.ok) return parsed;
    if (parsed.value) write[key] = parsed.value;
  }
  for (const key of keys) if (`${key}At` in body && !(key in body)) return bad(`${key}At`);
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  if (Object.keys(write).length === 0 && !allowEmpty) return bad('body');
  const { mutationId, clientAt } = envelope.value;
  return good(clientAt === undefined ? { write: write as W, mutationId } : { write: write as W, mutationId, clientAt });
}

// The longest planned span: the end is at most this many days after the start.
export const MAX_PLANNED_DAYS_AFTER = 13;

// The start and the optional end of a planned day, with the one time they share. `plannedOn: null` clears both.
function parsePlanned(body: Record<string, unknown>): Parsed<{ value: PlannedValue; at: number } | undefined> {
  if (!('plannedOn' in body) && !('plannedEndOn' in body) && !('plannedAt' in body)) return good(undefined);
  if (!('plannedOn' in body)) return bad('plannedOn');
  const at = parseClientTime(body.plannedAt, 'plannedAt');
  if (!at.ok) return at;
  const start = body.plannedOn;
  if (start === null) return 'plannedEndOn' in body && body.plannedEndOn !== null ? bad('plannedEndOn') : good({ value: { plannedOn: null }, at: at.value });
  if (typeof start !== 'string' || !isRealDate(start)) return bad('plannedOn');
  const end = body.plannedEndOn;
  if (end === undefined || end === null) return good({ value: { plannedOn: start, plannedEndOn: null }, at: at.value });
  if (typeof end !== 'string' || !isRealDate(end) || end < start || end > addDays(start, MAX_PLANNED_DAYS_AFTER)) return bad('plannedEndOn');
  return good({ value: { plannedOn: start, plannedEndOn: end }, at: at.value });
}

// One cost figure with its time: whole pence from 1 to MAX_PENCE, or `null` to clear. 0 is not accepted: the form turns it into a clear.
function parseCost(body: Record<string, unknown>, field: string, timeField: string): Parsed<Stamped<number | null> | undefined> {
  if (!(field in body) && !(timeField in body)) return good(undefined);
  if (!(field in body)) return bad(field);
  const at = parseClientTime(body[timeField], timeField);
  if (!at.ok) return at;
  const value = body[field];
  if (value === null) return good({ value: null, at: at.value });
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > MAX_PENCE) return bad(field);
  return good({ value, at: at.value });
}

export function parseProjectPut(body: Record<string, unknown>): Put<ProjectWrite> {
  const { plannedOn: _on, plannedEndOn: _end, plannedAt: _at, estimatePence: _e, estimateAt: _ea, spentPence: _s, spentAt: _sa, ...rest } = body;
  const planned = parsePlanned(body);
  if (!planned.ok) return planned;
  const estimate = parseCost(body, 'estimatePence', 'estimateAt');
  if (!estimate.ok) return estimate;
  const spent = parseCost(body, 'spentPence', 'spentAt');
  if (!spent.ok) return spent;
  const parsed = parseWrite<ProjectWrite>(rest, PROJECT_FIELD_KEYS, {
    title: value => trimmedText(value, MAX_PROJECT_TITLE, 'title'),
    notes: optionalText(MAX_PROJECT_NOTES, 'notes'),
    status: oneOf<ProjectStatus>(['active', 'finished'], 'status'),
    ordered: value => (typeof value === 'boolean' ? good(value) : bad('ordered')),
  }, planned.value !== undefined || estimate.value !== undefined || spent.value !== undefined);
  if (!parsed.ok) return parsed;
  const write: ProjectWrite = { ...parsed.value.write };
  if (planned.value !== undefined) write.planned = planned.value;
  if (estimate.value !== undefined) write.estimate = estimate.value;
  if (spent.value !== undefined) write.spent = spent.value;
  return good({ ...parsed.value, write });
}

export function parseStepPut(body: Record<string, unknown>): Put<StepWrite> {
  return parseWrite<StepWrite>(body, STEP_FIELD_KEYS, {
    text: value => trimmedText(value, MAX_STEP_TEXT, 'text'),
    note: optionalText(MAX_STEP_NOTE, 'note'),
    energy: value => (value === null || isEnergy(value) ? good(value) : bad('energy')),
    state: oneOf<StepState>(['todo', 'done'], 'state'),
    position: parsePosition,
  });
}

// A take, a release and a delete carry the envelope and nothing else.
export function parseTakeBody(body: Record<string, unknown>): Parsed<{ mutationId: string }> {
  const extra = unknownKey(body, ENVELOPE_KEYS, '');
  if (extra) return bad(extra);
  const envelope = parseEnvelope(body);
  return envelope.ok ? good({ mutationId: envelope.value.mutationId }) : envelope;
}

export function parseMaterialPut(body: Record<string, unknown>): Put<MaterialWrite> {
  return parseWrite<MaterialWrite>(body, ['text'], { text: value => trimmedText(value, MAX_MATERIAL_TEXT, 'text') });
}

// The lines to copy onto the shopping list, by material id. Up to 60, each a UUID; a repeated id is one line.
export function parseAddMaterials(body: Record<string, unknown>): Parsed<{ lineIds: string[]; mutationId: string; clientAt?: number }> {
  const extra = unknownKey(body, ['lineIds', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  if (!Array.isArray(body.lineIds) || body.lineIds.length < 1 || body.lineIds.length > MAX_ADD_MATERIALS) return bad('lineIds');
  const lineIds: string[] = [];
  for (const [index, raw] of body.lineIds.entries()) {
    const id = parseUuid(raw, `lineIds[${index}]`);
    if (!id.ok) return id;
    lineIds.push(id.value);
  }
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  const { mutationId, clientAt } = envelope.value;
  return good(clientAt === undefined ? { lineIds, mutationId } : { lineIds, mutationId, clientAt });
}
