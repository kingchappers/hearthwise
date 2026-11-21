import type { ProjectStatus, ProjectWrite, StepState, StepWrite } from '../projects/types';
import { ID_PATTERN, MAX_POSITION, POSITION_ALPHABET } from './projectRules';
import { ENVELOPE_KEYS, parseEnvelope, parseStamped } from './taskValidation';
import { bad, good, trimmedText, unknownKey } from './validation';
import type { Parsed } from './validation';

export const MAX_PROJECT_TITLE = 80;
export const MAX_PROJECT_NOTES = 1000;
export const MAX_STEP_TEXT = 120;
export const MAX_STEP_NOTE = 500;

const PROJECT_FIELD_KEYS = ['title', 'notes', 'status'];
const STEP_FIELD_KEYS = ['text', 'note', 'state', 'position'];

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
function parseWrite<W>(body: Record<string, unknown>, keys: string[], parsers: Record<string, (value: unknown) => Parsed<unknown>>): Put<W> {
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
  if (Object.keys(write).length === 0) return bad('body');
  const { mutationId, clientAt } = envelope.value;
  return good(clientAt === undefined ? { write: write as W, mutationId } : { write: write as W, mutationId, clientAt });
}

export function parseProjectPut(body: Record<string, unknown>): Put<ProjectWrite> {
  return parseWrite<ProjectWrite>(body, PROJECT_FIELD_KEYS, {
    title: value => trimmedText(value, MAX_PROJECT_TITLE, 'title'),
    notes: optionalText(MAX_PROJECT_NOTES, 'notes'),
    status: oneOf<ProjectStatus>(['active', 'finished'], 'status'),
  });
}

export function parseStepPut(body: Record<string, unknown>): Put<StepWrite> {
  return parseWrite<StepWrite>(body, STEP_FIELD_KEYS, {
    text: value => trimmedText(value, MAX_STEP_TEXT, 'text'),
    note: optionalText(MAX_STEP_NOTE, 'note'),
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
