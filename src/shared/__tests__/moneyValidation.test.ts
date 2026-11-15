import { describe, expect, it } from 'vitest';
import { MAX_PENCE } from '../money';
import { parseChange, parseChangeRespond, parseChangeWithdraw, parseMoneyDelete, parseMoneyPut, parseRespond } from '../moneyValidation';

const ID = '00000000-0000-4000-8000-000000000001';
const LOAN = '00000000-0000-4000-8000-000000000002';
const AT = Date.parse('2026-11-14T10:00:00Z');
const env = { mutationId: ID, clientAt: AT, notify: true };
const create = (over: Record<string, unknown> = {}) => ({
  kind: 'expense', paidBy: 'auth0|sam', amountPence: 6340, sharePence: 3170, description: 'Weekly shop', descriptionAt: AT, on: '2026-11-14', onAt: AT, ...env, ...over,
});
const fieldOf = (result: { ok: boolean; field?: string }) => (result.ok ? undefined : result.field);

describe('parseMoneyPut: create', () => {
  it('reads a whole create', () => {
    expect(parseMoneyPut(create())).toEqual({
      ok: true,
      value: {
        kind: 'expense', money: { paidBy: 'auth0|sam', amountPence: 6340, sharePence: 3170 },
        description: { value: 'Weekly shop', at: AT }, on: { value: '2026-11-14', at: AT }, mutationId: ID, clientAt: AT,
      },
    });
  });

  it('trims the description and allows a payment with a loan', () => {
    const parsed = parseMoneyPut(create({ kind: 'payment', sharePence: 6340, loanId: LOAN, description: '  Back  ' }));
    expect(parsed).toMatchObject({ ok: true, value: { money: { loanId: LOAN }, description: { value: 'Back' } } });
  });

  it.each([
    ['kind', { kind: 'gift' }], ['paidBy', { paidBy: '' }], ['amountPence', { amountPence: 0 }], ['amountPence', { amountPence: MAX_PENCE + 1 }],
    ['amountPence', { amountPence: 12.5 }], ['sharePence', { sharePence: 6341 }], ['sharePence', { sharePence: -1 }], ['sharePence', { sharePence: 0.5 }],
    ['description', { description: '' }], ['description', { description: 'x'.repeat(121) }], ['on', { on: '2026-02-30' }], ['onAt', { onAt: 1 }],
    ['descriptionAt', { descriptionAt: 'now' }], ['mutationId', { mutationId: 'nope' }], ['loanId', { loanId: LOAN }], ['baseVersion', { baseVersion: 1 }],
  ])('refuses a bad %s', (field, over) => {
    expect(fieldOf(parseMoneyPut(create(over)))).toBe(field);
  });

  it('accepts the limits exactly', () => {
    expect(parseMoneyPut(create({ amountPence: MAX_PENCE, sharePence: MAX_PENCE, description: 'x'.repeat(120) })).ok).toBe(true);
    expect(parseMoneyPut(create({ amountPence: 1, sharePence: 0 })).ok).toBe(true);
  });

  it('refuses a loan or payment whose share differs from its amount', () => {
    expect(fieldOf(parseMoneyPut(create({ kind: 'loan', sharePence: 100 })))).toBe('sharePence');
    expect(fieldOf(parseMoneyPut(create({ kind: 'payment', sharePence: 100 })))).toBe('sharePence');
  });

  it('refuses a loanId on a loan', () => {
    expect(fieldOf(parseMoneyPut(create({ kind: 'loan', sharePence: 6340, loanId: LOAN })))).toBe('loanId');
  });

  it('refuses a loanId that is not a UUID', () => {
    expect(fieldOf(parseMoneyPut(create({ kind: 'payment', sharePence: 6340, loanId: 'x' })))).toBe('loanId');
  });

  it('refuses an unknown key', () => {
    expect(fieldOf(parseMoneyPut(create({ colour: 'red' })))).toBe('colour');
  });

  it.each(['paidBy', 'amountPence', 'sharePence', 'description', 'descriptionAt', 'on', 'onAt'])('requires %s on a create', field => {
    const body = create();
    delete (body as Record<string, unknown>)[field];
    if (field === 'description' || field === 'on') delete (body as Record<string, unknown>)[`${field}At`];
    expect(fieldOf(parseMoneyPut(body))).toBe(field);
  });
});

describe('parseMoneyPut: edit', () => {
  it('reads a money edit with its base version', () => {
    const parsed = parseMoneyPut({ paidBy: 'auth0|sam', amountPence: 3640, sharePence: 1820, baseVersion: 2, ...env });
    expect(parsed).toEqual({ ok: true, value: { money: { paidBy: 'auth0|sam', amountPence: 3640, sharePence: 1820 }, baseVersion: 2, mutationId: ID, clientAt: AT } });
  });

  it('reads a description edit and a date edit on their own', () => {
    expect(parseMoneyPut({ description: 'Shop', descriptionAt: AT, mutationId: ID })).toMatchObject({ ok: true, value: { description: { value: 'Shop', at: AT } } });
    expect(parseMoneyPut({ on: '2026-11-15', onAt: AT, mutationId: ID })).toMatchObject({ ok: true, value: { on: { value: '2026-11-15', at: AT } } });
  });

  it('requires a base version with the money group, and the whole group', () => {
    expect(fieldOf(parseMoneyPut({ paidBy: 'a', amountPence: 100, sharePence: 50, mutationId: ID }))).toBe('baseVersion');
    expect(fieldOf(parseMoneyPut({ amountPence: 100, baseVersion: 1, mutationId: ID }))).toBe('paidBy');
    expect(fieldOf(parseMoneyPut({ paidBy: 'a', amountPence: 100, baseVersion: 1, mutationId: ID }))).toBe('sharePence');
  });

  it('refuses a base version with no money', () => {
    expect(fieldOf(parseMoneyPut({ description: 'x', descriptionAt: AT, baseVersion: 1, mutationId: ID }))).toBe('baseVersion');
  });

  it('refuses a time with no field, and an edit that changes nothing', () => {
    expect(fieldOf(parseMoneyPut({ descriptionAt: AT, mutationId: ID }))).toBe('descriptionAt');
    expect(fieldOf(parseMoneyPut({ onAt: AT, mutationId: ID }))).toBe('onAt');
    expect(fieldOf(parseMoneyPut({ mutationId: ID }))).toBe('body');
  });

  it('refuses a share above the amount', () => {
    expect(fieldOf(parseMoneyPut({ paidBy: 'a', amountPence: 100, sharePence: 101, baseVersion: 1, mutationId: ID }))).toBe('sharePence');
  });

  it('refuses a missing mutation id', () => {
    expect(fieldOf(parseMoneyPut({ description: 'x', descriptionAt: AT }))).toBe('mutationId');
  });
});

describe('parseRespond', () => {
  it('reads agree and decline with the version', () => {
    expect(parseRespond({ response: 'agree', version: 3, ...env })).toEqual({ ok: true, value: { response: 'agree', version: 3, mutationId: ID, clientAt: AT } });
    expect(parseRespond({ response: 'decline', version: 1, mutationId: ID })).toMatchObject({ ok: true });
  });
  it.each([['response', { response: 'maybe', version: 1 }], ['version', { response: 'agree', version: 0 }], ['version', { response: 'agree' }], ['extra', { response: 'agree', version: 1, extra: 1 }]])(
    'refuses a bad %s', (field, body) => {
      expect(fieldOf(parseRespond({ mutationId: ID, ...body }))).toBe(field);
    },
  );
});

describe('parseChange', () => {
  it('reads a money request', () => {
    expect(parseChange({ version: 2, money: { paidBy: 'a', amountPence: 3640, sharePence: 1820 }, ...env })).toEqual({
      ok: true, value: { version: 2, money: { paidBy: 'a', amountPence: 3640, sharePence: 1820 }, mutationId: ID, clientAt: AT },
    });
  });
  it('reads a delete request', () => {
    expect(parseChange({ version: 2, delete: true, mutationId: ID })).toMatchObject({ ok: true, value: { delete: true } });
  });
  it('refuses both or neither of money and delete', () => {
    expect(fieldOf(parseChange({ version: 1, delete: true, money: { paidBy: 'a', amountPence: 1, sharePence: 1 }, mutationId: ID }))).toBe('money');
    expect(fieldOf(parseChange({ version: 1, mutationId: ID }))).toBe('money');
  });
  it('refuses delete that is not true and bad money fields', () => {
    expect(fieldOf(parseChange({ version: 1, delete: false, mutationId: ID }))).toBe('delete');
    expect(fieldOf(parseChange({ version: 1, money: { paidBy: 'a', amountPence: 1.5, sharePence: 1 }, mutationId: ID }))).toBe('money.amountPence');
    expect(fieldOf(parseChange({ version: 1, money: { paidBy: 'a', amountPence: 1, sharePence: 2 }, mutationId: ID }))).toBe('money.sharePence');
    expect(fieldOf(parseChange({ version: 1, money: { paidBy: 'a', amountPence: 1, sharePence: 1, kind: 'loan' }, mutationId: ID }))).toBe('money.kind');
    expect(fieldOf(parseChange({ version: 1, money: { paidBy: 'a', amountPence: 1, sharePence: 1, loanId: 'x' }, mutationId: ID }))).toBe('money.loanId');
    expect(fieldOf(parseChange({ money: { paidBy: 'a', amountPence: 1, sharePence: 1 }, mutationId: ID }))).toBe('version');
  });
});

describe('parseChangeRespond, parseChangeWithdraw and parseMoneyDelete', () => {
  it('reads a response to a request', () => {
    expect(parseChangeRespond({ response: 'agree', requestId: LOAN, mutationId: ID })).toEqual({ ok: true, value: { response: 'agree', requestId: LOAN, mutationId: ID } });
    expect(fieldOf(parseChangeRespond({ response: 'agree', requestId: 'x', mutationId: ID }))).toBe('requestId');
    expect(fieldOf(parseChangeRespond({ response: 'no', requestId: LOAN, mutationId: ID }))).toBe('response');
  });
  it('reads a withdrawal', () => {
    expect(parseChangeWithdraw({ requestId: LOAN, mutationId: ID })).toEqual({ ok: true, value: { requestId: LOAN, mutationId: ID } });
    expect(fieldOf(parseChangeWithdraw({ mutationId: ID }))).toBe('requestId');
  });
  it('reads a delete with the envelope only', () => {
    expect(parseMoneyDelete({ ...env })).toEqual({ ok: true, value: { mutationId: ID, clientAt: AT } });
    expect(fieldOf(parseMoneyDelete({ mutationId: ID, version: 1 }))).toBe('version');
    expect(fieldOf(parseMoneyDelete({}))).toBe('mutationId');
  });
});
