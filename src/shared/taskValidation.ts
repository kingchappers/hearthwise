import type { Change, ChecklistStep, CreateTaskInput, PatchTaskInput, ProposalInput } from '../tasks/types';
import { isRealDate } from './schedule';
import type { Repeat, Weekday } from './schedule';
import { WEEKDAYS } from './schedule';
import { bad, good, isObject, trimmedText, unknownKey } from './validation';
import type { Parsed } from './validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 2026-01-01T00:00:00Z. Nothing the app sends is older, so an older time is a bug or a forgery.
const EARLIEST_CLIENT_TIME = 1_767_225_600_000;
const MAX_NOTES = 2000;
const MAX_CHECKLIST = 30;
const MAX_STEP = 120;
const MAX_ENTRIES = 100;
const MAX_ASSIGNEE = 128;

const isInt = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const inRange = (value: unknown, min: number, max: number): value is number => isInt(value) && value >= min && value <= max;

export function parseUuid(value: unknown, field: string): Parsed<string> {
  return typeof value === 'string' && UUID.test(value) ? good(value) : bad(field);
}

export const parseTaskTitle = (value: unknown): Parsed<string> => trimmedText(value, 120, 'title');

export function parseNotes(value: unknown): Parsed<string> {
  return typeof value === 'string' && Array.from(value).length <= MAX_NOTES ? good(value) : bad('notes');
}

export function parseChecklist(value: unknown): Parsed<ChecklistStep[]> {
  if (!Array.isArray(value) || value.length > MAX_CHECKLIST) return bad('checklist');
  const steps: ChecklistStep[] = [];
  const seen = new Set<string>();
  for (const [index, raw] of value.entries()) {
    const at = `checklist[${index}]`;
    if (!isObject(raw)) return bad(at);
    const id = parseUuid(raw.id, `${at}.id`);
    if (!id.ok) return id;
    if (seen.has(id.value)) return bad(`${at}.id`);
    seen.add(id.value);
    const text = trimmedText(raw.text, MAX_STEP, `${at}.text`);
    if (!text.ok) return text;
    steps.push({ id: id.value, text: text.value });
  }
  return good(steps);
}

export function parseDay(value: unknown, field: string): Parsed<string> {
  return typeof value === 'string' && isRealDate(value) ? good(value) : bad(field);
}

export function parseClientTime(value: unknown, field: string): Parsed<number> {
  return isInt(value) && value >= EARLIEST_CLIENT_TIME ? good(value) : bad(field);
}

export function parseAssignee(value: unknown): Parsed<string> {
  if (value === 'either' || value === 'both') return good(value);
  // A member's user id: whatever the login provider issued, so only its size and plainness are checked.
  const plain = typeof value === 'string' && value.length >= 1 && value.length <= MAX_ASSIGNEE && !/[\u0000-\u001f]/.test(value);
  return plain ? good(value) : bad('assignee');
}

const parseVersion = (value: unknown, field: string): Parsed<number> => (inRange(value, 1, Number.MAX_SAFE_INTEGER) ? good(value) : bad(field));

export function parseRepeat(value: unknown): Parsed<Repeat> {
  if (!isObject(value)) return bad('repeat');
  if (value.type === 'none') {
    const extra = unknownKey(value, ['type'], 'repeat');
    return extra ? bad(extra) : good({ type: 'none' });
  }
  if (value.type === 'after') {
    const extra = unknownKey(value, ['type', 'days'], 'repeat');
    if (extra) return bad(extra);
    return inRange(value.days, 1, 365) ? good({ type: 'after', days: value.days }) : bad('repeat.days');
  }
  if (value.type !== 'fixed') return bad('repeat.type');

  const extra = unknownKey(value, ['type', 'every', 'unit', 'weekdays', 'dayOfMonth', 'startOn'], 'repeat');
  if (extra) return bad(extra);
  if (!inRange(value.every, 1, 52)) return bad('repeat.every');
  if (value.unit !== 'day' && value.unit !== 'week' && value.unit !== 'month') return bad('repeat.unit');
  const rule: Extract<Repeat, { type: 'fixed' }> = { type: 'fixed', every: value.every, unit: value.unit, startOn: '' };

  if ('weekdays' in value) {
    const days = value.weekdays;
    const valid = Array.isArray(days) && days.length >= 1 && days.length <= 7 && days.every(day => WEEKDAYS.includes(day as Weekday)) && new Set(days).size === days.length;
    if (!valid) return bad('repeat.weekdays');
    rule.weekdays = days as Weekday[];
  }
  if ('dayOfMonth' in value) {
    if (!inRange(value.dayOfMonth, 1, 31)) return bad('repeat.dayOfMonth');
    rule.dayOfMonth = value.dayOfMonth;
  }
  if (typeof value.startOn !== 'string' || !isRealDate(value.startOn)) return bad('repeat.startOn');
  rule.startOn = value.startOn;
  return good(rule);
}

// What every write request may carry besides its own fields: the mutation id (required), and two fields step 6 uses.
interface Envelope {
  mutationId: string;
  clientAt?: number;
  notify?: boolean;
}

export const ENVELOPE_KEYS = ['mutationId', 'clientAt', 'notify'];

export function parseEnvelope(body: Record<string, unknown>): Parsed<Envelope> {
  const mutationId = parseUuid(body.mutationId, 'mutationId');
  if (!mutationId.ok) return mutationId;
  const envelope: Envelope = { mutationId: mutationId.value };
  if ('clientAt' in body && body.clientAt !== undefined) {
    const clientAt = parseClientTime(body.clientAt, 'clientAt');
    if (!clientAt.ok) return clientAt;
    envelope.clientAt = clientAt.value;
  }
  if ('notify' in body && body.notify !== undefined) {
    if (typeof body.notify !== 'boolean') return bad('notify');
    envelope.notify = body.notify;
  }
  return good(envelope);
}

export function parseCreateTask(body: Record<string, unknown>): Parsed<CreateTaskInput> {
  const extra = unknownKey(body, ['id', 'title', 'notes', 'assignee', 'repeat', 'dueOn', 'checklist', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  const id = parseUuid(body.id, 'id');
  if (!id.ok) return id;
  const title = parseTaskTitle(body.title);
  if (!title.ok) return title;
  const assignee = parseAssignee(body.assignee);
  if (!assignee.ok) return assignee;
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;

  const input: CreateTaskInput = { id: id.value, title: title.value, assignee: assignee.value, repeat: { type: 'none' }, ...envelope.value };
  if (body.notes !== undefined) {
    const notes = parseNotes(body.notes);
    if (!notes.ok) return notes;
    input.notes = notes.value;
  }
  if (body.repeat !== undefined) {
    const repeat = parseRepeat(body.repeat);
    if (!repeat.ok) return repeat;
    input.repeat = repeat.value;
  }
  if (body.dueOn !== undefined) {
    const dueOn = parseDay(body.dueOn, 'dueOn');
    if (!dueOn.ok) return dueOn;
    input.dueOn = dueOn.value;
  }
  if (body.checklist !== undefined) {
    const checklist = parseChecklist(body.checklist);
    if (!checklist.ok) return checklist;
    input.checklist = checklist.value;
  }
  return good(input);
}

function parseStamped<T>(body: Record<string, unknown>, field: string, parse: (value: unknown) => Parsed<T>): Parsed<{ value: T; at: number } | undefined> {
  if (!(field in body)) return good(undefined);
  const value = parse(body[field]);
  if (!value.ok) return value;
  const at = parseClientTime(body[`${field}At`], `${field}At`);
  return at.ok ? good({ value: value.value, at: at.value }) : at;
}

function parseTicks(value: unknown): Parsed<NonNullable<PatchTaskInput['ticks']>> {
  if (!isObject(value)) return bad('ticks');
  if (!inRange(value.cycleSeq, 1, Number.MAX_SAFE_INTEGER)) return bad('ticks.cycleSeq');
  if (!isObject(value.steps) || Object.keys(value.steps).length < 1 || Object.keys(value.steps).length > MAX_CHECKLIST) return bad('ticks.steps');
  const steps: Record<string, { done: boolean; at: number }> = {};
  for (const [id, tick] of Object.entries(value.steps)) {
    if (!UUID.test(id)) return bad('ticks.steps');
    if (!isObject(tick)) return bad(`ticks.steps.${id}`);
    if (typeof tick.done !== 'boolean') return bad(`ticks.steps.${id}.done`);
    const at = parseClientTime(tick.at, `ticks.steps.${id}.at`);
    if (!at.ok) return at;
    steps[id] = { done: tick.done, at: at.value };
  }
  return good({ cycleSeq: value.cycleSeq, steps });
}

export function parsePatchTask(body: Record<string, unknown>): Parsed<PatchTaskInput> {
  const extra = unknownKey(body, ['title', 'titleAt', 'notes', 'notesAt', 'checklist', 'checklistAt', 'ticks', 'assignee', 'repeat', 'dueOn', 'baseRuleVersion', 'baseCycleSeq', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  const input: PatchTaskInput = { ...envelope.value };

  const title = parseStamped(body, 'title', parseTaskTitle);
  if (!title.ok) return title;
  if (title.value) input.title = title.value;
  const notes = parseStamped(body, 'notes', parseNotes);
  if (!notes.ok) return notes;
  if (notes.value) input.notes = notes.value;
  const checklist = parseStamped(body, 'checklist', parseChecklist);
  if (!checklist.ok) return checklist;
  if (checklist.value) input.checklist = checklist.value;

  if ('ticks' in body) {
    const ticks = parseTicks(body.ticks);
    if (!ticks.ok) return ticks;
    input.ticks = ticks.value;
  }

  if ('assignee' in body) {
    const assignee = parseAssignee(body.assignee);
    if (!assignee.ok) return assignee;
    const base = parseVersion(body.baseRuleVersion, 'baseRuleVersion');
    if (!base.ok) return base;
    input.assignee = { value: assignee.value, baseRuleVersion: base.value };
  }

  if ('repeat' in body) {
    const repeat = parseRepeat(body.repeat);
    if (!repeat.ok) return repeat;
    const change: NonNullable<PatchTaskInput['repeat']> = { value: repeat.value, baseRuleVersion: 0 };
    if (body.dueOn !== undefined) {
      const dueOn = parseDay(body.dueOn, 'dueOn');
      if (!dueOn.ok) return dueOn;
      change.dueOn = dueOn.value;
    } else if (repeat.value.type !== 'none') {
      return bad('dueOn');
    }
    const base = parseVersion(body.baseRuleVersion, 'baseRuleVersion');
    if (!base.ok) return base;
    change.baseRuleVersion = base.value;
    input.repeat = change;
  } else if ('dueOn' in body) {
    const dueOn = parseDay(body.dueOn, 'dueOn');
    if (!dueOn.ok) return dueOn;
    const baseRule = parseVersion(body.baseRuleVersion, 'baseRuleVersion');
    if (!baseRule.ok) return baseRule;
    const baseCycle = parseVersion(body.baseCycleSeq, 'baseCycleSeq');
    if (!baseCycle.ok) return baseCycle;
    input.dueOn = { value: dueOn.value, baseRuleVersion: baseRule.value, baseCycleSeq: baseCycle.value };
  }

  const changes = ['title', 'notes', 'checklist', 'ticks', 'assignee', 'repeat', 'dueOn'] as const;
  return changes.some(key => input[key] !== undefined) ? good(input) : bad('body');
}

export function parseCompleteBody(body: Record<string, unknown>): Parsed<{ cycleSeq: number; completedAt: number; mutationId: string }> {
  const extra = unknownKey(body, ['cycleSeq', 'completedAt', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  if (!inRange(body.cycleSeq, 1, Number.MAX_SAFE_INTEGER)) return bad('cycleSeq');
  const completedAt = parseClientTime(body.completedAt, 'completedAt');
  if (!completedAt.ok) return completedAt;
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  return good({ cycleSeq: body.cycleSeq, completedAt: completedAt.value, mutationId: envelope.value.mutationId });
}

export function parseDeleteBody(body: Record<string, unknown>): Parsed<{ baseRuleVersion: number; mutationId: string }> {
  const extra = unknownKey(body, ['baseRuleVersion', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  const base = parseVersion(body.baseRuleVersion, 'baseRuleVersion');
  if (!base.ok) return base;
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  return good({ baseRuleVersion: base.value, mutationId: envelope.value.mutationId });
}

// For routes whose only input is the mutation id: undo, accept, decline, withdraw.
export function parseMutationBody(body: Record<string, unknown>): Parsed<{ mutationId: string }> {
  const extra = unknownKey(body, ENVELOPE_KEYS, '');
  if (extra) return bad(extra);
  const envelope = parseEnvelope(body);
  return envelope.ok ? good({ mutationId: envelope.value.mutationId }) : envelope;
}

function parseChange(value: unknown): Parsed<Change> {
  if (!isObject(value)) return bad('change');
  if (value.kind === 'swap' || value.kind === 'delete' || value.kind === 'restore') {
    const extra = unknownKey(value, ['kind'], 'change');
    return extra ? bad(extra) : good({ kind: value.kind });
  }
  if (value.kind !== 'edit') return bad('change.kind');
  const extra = unknownKey(value, ['kind', 'set'], 'change');
  if (extra) return bad(extra);
  if (!isObject(value.set) || Object.keys(value.set).length === 0) return bad('change.set');
  const setExtra = unknownKey(value.set, ['assignee', 'dueOn', 'repeat'], 'change.set');
  if (setExtra) return bad(setExtra);

  const set: Extract<Change, { kind: 'edit' }>['set'] = {};
  if ('assignee' in value.set) {
    const assignee = parseAssignee(value.set.assignee);
    if (!assignee.ok) return bad('change.set.assignee');
    set.assignee = assignee.value;
  }
  if ('repeat' in value.set) {
    const repeat = parseRepeat(value.set.repeat);
    if (!repeat.ok) return bad(repeat.field.replace(/^repeat/, 'change.set.repeat'));
    set.repeat = repeat.value;
  }
  if ('dueOn' in value.set) {
    const dueOn = parseDay(value.set.dueOn, 'change.set.dueOn');
    if (!dueOn.ok) return dueOn;
    set.dueOn = dueOn.value;
  } else if (set.repeat && set.repeat.type !== 'none') {
    return bad('change.set.dueOn');
  }
  return good({ kind: 'edit', set });
}

export function parseProposalBody(body: Record<string, unknown>): Parsed<ProposalInput> {
  const extra = unknownKey(body, ['id', 'taskId', 'change', 'baseRuleVersion', 'baseCycleSeq', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  const id = parseUuid(body.id, 'id');
  if (!id.ok) return id;
  const taskId = parseUuid(body.taskId, 'taskId');
  if (!taskId.ok) return taskId;
  const change = parseChange(body.change);
  if (!change.ok) return change;
  const baseRuleVersion = parseVersion(body.baseRuleVersion, 'baseRuleVersion');
  if (!baseRuleVersion.ok) return baseRuleVersion;
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;

  const input: ProposalInput = { id: id.value, taskId: taskId.value, change: change.value, baseRuleVersion: baseRuleVersion.value, ...envelope.value };
  // A swap, or a date change on its own, is about one cycle: the proposal records which.
  const aboutOneCycle = change.value.kind === 'swap'
    || (change.value.kind === 'edit' && change.value.set.dueOn !== undefined && change.value.set.repeat === undefined);
  if (aboutOneCycle || body.baseCycleSeq !== undefined) {
    const baseCycleSeq = parseVersion(body.baseCycleSeq, 'baseCycleSeq');
    if (!baseCycleSeq.ok) return baseCycleSeq;
    input.baseCycleSeq = baseCycleSeq.value;
  }
  return good(input);
}

export function parseRestoreBody(body: Record<string, unknown>): Parsed<{ entries: { kind: 'task' | 'item'; id: string }[]; mutationId: string }> {
  const extra = unknownKey(body, ['entries', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > MAX_ENTRIES) return bad('entries');
  const entries: { kind: 'task' | 'item'; id: string }[] = [];
  for (const [index, raw] of body.entries.entries()) {
    if (!isObject(raw)) return bad(`entries[${index}]`);
    if (raw.kind !== 'task' && raw.kind !== 'item') return bad(`entries[${index}].kind`);
    const id = parseUuid(raw.id, `entries[${index}].id`);
    if (!id.ok) return id;
    entries.push({ kind: raw.kind, id: id.value });
  }
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  return good({ entries, mutationId: envelope.value.mutationId });
}
