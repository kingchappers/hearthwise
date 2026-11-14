import type { BatchEntry, ItemWrite } from '../shopping/types';
import { ENVELOPE_KEYS, parseClientTime, parseEnvelope, parseUuid } from './taskValidation';
import { bad, good, isObject, trimmedText, unknownKey } from './validation';
import type { Parsed } from './validation';

const MAX_TEXT = 200;
const MAX_QUANTITY = 40;
const MAX_ENTRIES = 100;
const FIELD_KEYS = ['text', 'textAt', 'quantity', 'quantityAt', 'ticked', 'tickedAt'];

// The fields of a write, each with the client time beside it. `prefix` is how errors name the field ("writes[2]." in a batch).
function parseFields(body: Record<string, unknown>, prefix: string): Parsed<ItemWrite> {
  const write: ItemWrite = {};

  if ('text' in body) {
    const text = trimmedText(body.text, MAX_TEXT, `${prefix}text`);
    if (!text.ok) return text;
    const at = parseClientTime(body.textAt, `${prefix}textAt`);
    if (!at.ok) return at;
    write.text = { value: text.value, at: at.value };
  }
  if ('quantity' in body) {
    // Characters, not UTF-16 units; an empty quantity clears it.
    if (typeof body.quantity !== 'string' || Array.from(body.quantity.trim()).length > MAX_QUANTITY) return bad(`${prefix}quantity`);
    const at = parseClientTime(body.quantityAt, `${prefix}quantityAt`);
    if (!at.ok) return at;
    write.quantity = { value: body.quantity.trim(), at: at.value };
  }
  if ('ticked' in body) {
    if (typeof body.ticked !== 'boolean') return bad(`${prefix}ticked`);
    const at = parseClientTime(body.tickedAt, `${prefix}tickedAt`);
    if (!at.ok) return at;
    write.ticked = { value: body.ticked, at: at.value };
  }
  // A time with no field to go with it is a mistake, not a no-op.
  for (const at of ['textAt', 'quantityAt', 'tickedAt']) {
    if (at in body && !(at.slice(0, -2) in body)) return bad(`${prefix}${at}`);
  }
  return good(write);
}

export function parseItemPut(body: Record<string, unknown>): Parsed<{ write: ItemWrite; mutationId: string; clientAt?: number }> {
  const extra = unknownKey(body, [...FIELD_KEYS, ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  // Each field before the envelope, so a missing time is named rather than a missing mutation id.
  const write = parseFields(body, '');
  if (!write.ok) return write;
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  if (Object.keys(write.value).length === 0) return bad('body');
  const { mutationId, clientAt } = envelope.value;
  return good(clientAt === undefined ? { write: write.value, mutationId } : { write: write.value, mutationId, clientAt });
}

export function parseItemDeleteBody(body: Record<string, unknown>): Parsed<{ mutationId: string }> {
  const extra = unknownKey(body, ENVELOPE_KEYS, '');
  if (extra) return bad(extra);
  const envelope = parseEnvelope(body);
  return envelope.ok ? good({ mutationId: envelope.value.mutationId }) : envelope;
}

// One batch entry. A bad one is reported as invalid, by id, and the rest of the batch still runs.
function parseEntry(raw: unknown, index: number): BatchEntry {
  const at = `writes[${index}]`;
  const rawId = isObject(raw) && typeof raw.id === 'string' ? raw.id.slice(0, 64) : '';
  if (!isObject(raw)) return { id: rawId, invalid: at };
  const id = parseUuid(raw.id, `${at}.id`);
  if (!id.ok) return { id: rawId, invalid: id.field };

  if (raw.delete === true) {
    const extra = unknownKey(raw, ['id', 'delete', 'ifTickedAt'], at);
    if (extra) return { id: id.value, invalid: extra };
    if (raw.ifTickedAt === undefined) return { id: id.value, delete: true };
    const ifTickedAt = parseClientTime(raw.ifTickedAt, `${at}.ifTickedAt`);
    return ifTickedAt.ok ? { id: id.value, delete: true, ifTickedAt: ifTickedAt.value } : { id: id.value, invalid: ifTickedAt.field };
  }

  const extra = unknownKey(raw, ['id', ...FIELD_KEYS], at);
  if (extra) return { id: id.value, invalid: extra };
  const write = parseFields(raw, `${at}.`);
  if (!write.ok) return { id: id.value, invalid: write.field };
  return Object.keys(write.value).length === 0 ? { id: id.value, invalid: at } : { id: id.value, write: write.value };
}

export function parseItemBatch(body: Record<string, unknown>): Parsed<{ entries: BatchEntry[]; mutationId: string }> {
  const extra = unknownKey(body, ['writes', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  if (!Array.isArray(body.writes) || body.writes.length < 1 || body.writes.length > MAX_ENTRIES) return bad('writes');
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  return good({ entries: body.writes.map(parseEntry), mutationId: envelope.value.mutationId });
}
