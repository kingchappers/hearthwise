import { MONEY_KINDS } from '../money/types';
import type { ChangeInput, ChangeRespondInput, ChangeWithdrawInput, MoneyChange, MoneyKind, MoneyPutInput, RespondInput } from '../money/types';
import { MAX_PENCE } from './money';
import { ENVELOPE_KEYS, parseDay, parseEnvelope, parseStamped, parseUuid } from './taskValidation';
import { bad, good, isObject, trimmedText, unknownKey } from './validation';
import type { Parsed } from './validation';

export const MAX_DESCRIPTION = 120;
const MAX_USER_ID = 128;

const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;

const MONEY_KEYS = ['paidBy', 'amountPence', 'sharePence', 'loanId'];

function parsePaidBy(value: unknown, field: string): Parsed<string> {
  const plain = typeof value === 'string' && value.length >= 1 && value.length <= MAX_USER_ID && !/[\u0000-\u001f]/.test(value);
  return plain ? good(value) : bad(field);
}

// The share rules that do not need the stored entry. `kind` is left out on an edit, so only the range is checked then, and the
// server checks it against the entry's own kind.
function parseUnit(source: Record<string, unknown>, kind: MoneyKind | undefined, path: string): Parsed<MoneyChange> {
  const field = (name: string): string => (path === '' ? name : `${path}.${name}`);
  const paidBy = parsePaidBy(source.paidBy, field('paidBy'));
  if (!paidBy.ok) return paidBy;
  if (!isWhole(source.amountPence, 1, MAX_PENCE)) return bad(field('amountPence'));
  const amountPence = source.amountPence;
  if (!isWhole(source.sharePence, 0, amountPence)) return bad(field('sharePence'));
  const sharePence = source.sharePence;
  if ((kind === 'loan' || kind === 'payment') && sharePence !== amountPence) return bad(field('sharePence'));

  const money: MoneyChange = { paidBy: paidBy.value, amountPence, sharePence };
  if (source.loanId !== undefined) {
    if (kind !== undefined && kind !== 'payment') return bad(field('loanId'));
    const loanId = parseUuid(source.loanId, field('loanId'));
    if (!loanId.ok) return loanId;
    money.loanId = loanId.value;
  }
  return good(money);
}

function parseKind(value: unknown): Parsed<MoneyKind> {
  return MONEY_KINDS.includes(value as MoneyKind) ? good(value as MoneyKind) : bad('kind');
}

const parseDescription = (value: unknown): Parsed<string> => trimmedText(value, MAX_DESCRIPTION, 'description');
const parseOn = (value: unknown): Parsed<string> => parseDay(value, 'on');

function envelopeOf<T extends { mutationId: string; clientAt?: number }>(body: Record<string, unknown>, rest: Omit<T, 'mutationId' | 'clientAt'>): Parsed<T> {
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;
  const { mutationId, clientAt } = envelope.value;
  return good({ ...rest, mutationId, ...(clientAt === undefined ? {} : { clientAt }) } as T);
}

// A create sends `kind` and everything else; an edit sends no `kind` and any of the money group (with its base version),
// the description, or the date.
export function parseMoneyPut(body: Record<string, unknown>): Parsed<MoneyPutInput> {
  const extra = unknownKey(body, ['kind', ...MONEY_KEYS, 'baseVersion', 'description', 'descriptionAt', 'on', 'onAt', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  const envelope = parseEnvelope(body);
  if (!envelope.ok) return envelope;

  const creating = 'kind' in body;
  const kind = creating ? parseKind(body.kind) : undefined;
  if (kind && !kind.ok) return kind;

  const rest: Omit<MoneyPutInput, 'mutationId' | 'clientAt'> = {};
  if (kind) rest.kind = kind.value;

  const hasMoney = MONEY_KEYS.some(key => key in body);
  if (hasMoney || creating) {
    for (const key of ['paidBy', 'amountPence', 'sharePence']) if (!(key in body)) return bad(key);
    const money = parseUnit(body, kind?.value, '');
    if (!money.ok) return money;
    rest.money = money.value;
  }
  if ('baseVersion' in body) {
    if (creating || !hasMoney || !isWhole(body.baseVersion, 1, Number.MAX_SAFE_INTEGER)) return bad('baseVersion');
    rest.baseVersion = body.baseVersion;
  } else if (hasMoney && !creating) {
    return bad('baseVersion');
  }

  const description = parseStamped(body, 'description', parseDescription);
  if (!description.ok) return description;
  if (description.value) rest.description = description.value;
  const on = parseStamped(body, 'on', parseOn);
  if (!on.ok) return on;
  if (on.value) rest.on = on.value;
  // A time with no field to go with it is a mistake, not a no-op.
  for (const key of ['description', 'on']) if (`${key}At` in body && !(key in body)) return bad(`${key}At`);

  if (creating) {
    if (!rest.description) return bad('description');
    if (!rest.on) return bad('on');
  } else if (!rest.money && !rest.description && !rest.on) {
    return bad('body');
  }
  return envelopeOf<MoneyPutInput>(body, rest);
}

const parseResponse = (value: unknown): Parsed<'agree' | 'decline'> => (value === 'agree' || value === 'decline' ? good(value) : bad('response'));

export function parseRespond(body: Record<string, unknown>): Parsed<RespondInput> {
  const extra = unknownKey(body, ['response', 'version', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  const response = parseResponse(body.response);
  if (!response.ok) return response;
  if (!isWhole(body.version, 1, Number.MAX_SAFE_INTEGER)) return bad('version');
  return envelopeOf<RespondInput>(body, { response: response.value, version: body.version });
}

export function parseChange(body: Record<string, unknown>): Parsed<ChangeInput> {
  const extra = unknownKey(body, ['version', 'money', 'delete', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  if (!isWhole(body.version, 1, Number.MAX_SAFE_INTEGER)) return bad('version');
  const hasMoney = body.money !== undefined;
  const hasDelete = body.delete !== undefined;
  if (hasMoney === hasDelete) return bad('money');

  const rest: Omit<ChangeInput, 'mutationId' | 'clientAt'> = { version: body.version };
  if (hasDelete) {
    if (body.delete !== true) return bad('delete');
    rest.delete = true;
  } else {
    if (!isObject(body.money)) return bad('money');
    const unknown = unknownKey(body.money, MONEY_KEYS, 'money');
    if (unknown) return bad(unknown);
    const money = parseUnit(body.money, undefined, 'money');
    if (!money.ok) return money;
    rest.money = money.value;
  }
  return envelopeOf<ChangeInput>(body, rest);
}

export function parseChangeRespond(body: Record<string, unknown>): Parsed<ChangeRespondInput> {
  const extra = unknownKey(body, ['response', 'requestId', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  const response = parseResponse(body.response);
  if (!response.ok) return response;
  const requestId = parseUuid(body.requestId, 'requestId');
  if (!requestId.ok) return requestId;
  return envelopeOf<ChangeRespondInput>(body, { response: response.value, requestId: requestId.value });
}

export function parseChangeWithdraw(body: Record<string, unknown>): Parsed<ChangeWithdrawInput> {
  const extra = unknownKey(body, ['requestId', ...ENVELOPE_KEYS], '');
  if (extra) return bad(extra);
  const requestId = parseUuid(body.requestId, 'requestId');
  if (!requestId.ok) return requestId;
  return envelopeOf<ChangeWithdrawInput>(body, { requestId: requestId.value });
}

export function parseMoneyDelete(body: Record<string, unknown>): Parsed<{ mutationId: string; clientAt?: number }> {
  const extra = unknownKey(body, ENVELOPE_KEYS, '');
  if (extra) return bad(extra);
  return envelopeOf(body, {});
}

