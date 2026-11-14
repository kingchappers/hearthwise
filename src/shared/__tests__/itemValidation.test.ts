import { describe, expect, it } from 'vitest';
import { parseItemBatch, parseItemDeleteBody, parseItemPut } from '../itemValidation';

const ok = <T>(value: T) => ({ ok: true, value });
const bad = (field: string) => ({ ok: false, field });
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MUT = uuid(999);
const AT = 1_800_000_000_000;

describe('parseItemPut', () => {
  it('takes each field with its time', () => {
    expect(parseItemPut({ mutationId: MUT, text: '  Milk ', textAt: AT, quantity: '2 kg', quantityAt: AT, ticked: true, tickedAt: AT }))
      .toEqual(ok({ mutationId: MUT, write: { text: { value: 'Milk', at: AT }, quantity: { value: '2 kg', at: AT }, ticked: { value: true, at: AT } } }));
  });

  it('limits text to 1-200 characters and quantity to 40', () => {
    expect(parseItemPut({ mutationId: MUT, text: 'x'.repeat(200), textAt: AT }).ok).toBe(true);
    expect(parseItemPut({ mutationId: MUT, text: 'x'.repeat(201), textAt: AT })).toEqual(bad('text'));
    expect(parseItemPut({ mutationId: MUT, text: '   ', textAt: AT })).toEqual(bad('text'));
    expect(parseItemPut({ mutationId: MUT, text: 'x'.repeat(10_240), textAt: AT })).toEqual(bad('text'));
    expect(parseItemPut({ mutationId: MUT, quantity: 'x'.repeat(40), quantityAt: AT }).ok).toBe(true);
    expect(parseItemPut({ mutationId: MUT, quantity: 'x'.repeat(41), quantityAt: AT })).toEqual(bad('quantity'));
    expect(parseItemPut({ mutationId: MUT, quantity: '', quantityAt: AT }).ok).toBe(true);
  });

  it('needs the time beside each field, and a real client time', () => {
    expect(parseItemPut({ mutationId: MUT, text: 'Milk' })).toEqual(bad('textAt'));
    expect(parseItemPut({ mutationId: MUT, ticked: true })).toEqual(bad('tickedAt'));
    expect(parseItemPut({ mutationId: MUT, text: 'Milk', textAt: 5 })).toEqual(bad('textAt'));
    expect(parseItemPut({ mutationId: MUT, ticked: 'yes', tickedAt: AT })).toEqual(bad('ticked'));
  });

  it('refuses an empty put, an unknown key and a missing mutation id', () => {
    expect(parseItemPut({ mutationId: MUT })).toEqual(bad('body'));
    expect(parseItemPut({ mutationId: MUT, colour: 'red', text: 'x', textAt: AT })).toEqual(bad('colour'));
    expect(parseItemPut({ text: 'x', textAt: AT })).toEqual(bad('mutationId'));
  });
});

describe('parseItemDeleteBody', () => {
  it('takes only a mutation id', () => {
    expect(parseItemDeleteBody({ mutationId: MUT })).toEqual(ok({ mutationId: MUT }));
    expect(parseItemDeleteBody({})).toEqual(bad('mutationId'));
    expect(parseItemDeleteBody({ mutationId: MUT, extra: 1 })).toEqual(bad('extra'));
  });
});

describe('parseItemBatch', () => {
  const put = (n: number) => ({ id: uuid(n), text: 'Milk', textAt: AT });

  it('takes puts and deletes, with the ticked time a clear-ticked delete saw', () => {
    const parsed = parseItemBatch({ mutationId: MUT, writes: [put(1), { id: uuid(2), delete: true, ifTickedAt: AT }, { id: uuid(3), delete: true }] });
    expect(parsed).toEqual(ok({ mutationId: MUT, entries: [
      { id: uuid(1), write: { text: { value: 'Milk', at: AT } } },
      { id: uuid(2), delete: true, ifTickedAt: AT },
      { id: uuid(3), delete: true },
    ] }));
  });

  it('takes 1 to 100 entries', () => {
    expect(parseItemBatch({ mutationId: MUT, writes: [] })).toEqual(bad('writes'));
    expect(parseItemBatch({ mutationId: MUT, writes: Array.from({ length: 100 }, (_, n) => put(n + 1)) }).ok).toBe(true);
    expect(parseItemBatch({ mutationId: MUT, writes: Array.from({ length: 101 }, (_, n) => put(n + 1)) })).toEqual(bad('writes'));
    expect(parseItemBatch({ mutationId: MUT, writes: 'x' })).toEqual(bad('writes'));
  });

  it('marks a bad entry invalid without failing the batch', () => {
    const parsed = parseItemBatch({ mutationId: MUT, writes: [put(1), { id: 'nope', text: 'x', textAt: AT }, { id: uuid(3), text: 'x'.repeat(201), textAt: AT }, { id: uuid(4), delete: true, colour: 'red' }] });
    expect(parsed.ok).toBe(true);
    const entries = (parsed as { value: { entries: object[] } }).value.entries;
    expect(entries[0]).toMatchObject({ id: uuid(1) });
    expect(entries[1]).toMatchObject({ id: 'nope', invalid: 'writes[1].id' });
    expect(entries[2]).toMatchObject({ id: uuid(3), invalid: 'writes[2].text' });
    expect(entries[3]).toMatchObject({ id: uuid(4), invalid: 'writes[3].colour' });
  });

  it('refuses a missing mutation id and an unknown top-level key', () => {
    expect(parseItemBatch({ writes: [put(1)] })).toEqual(bad('mutationId'));
    expect(parseItemBatch({ mutationId: MUT, writes: [put(1)], extra: 1 })).toEqual(bad('extra'));
  });
});
