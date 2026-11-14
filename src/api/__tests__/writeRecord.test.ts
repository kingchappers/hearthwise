import { beforeEach, describe, expect, it } from 'vitest';
import { ConditionFailedError } from '../../store';
import { MemoryStore } from '../../store/memory';
import { mutKey } from '../../tasks/keys';
import { readWriteRecord, withWriteRecord } from '../writeRecord';

const HID = 'h1';
const NOW_SECONDS = 1_800_000_000;
let store: MemoryStore;

beforeEach(() => { store = new MemoryStore(); });

describe('withWriteRecord', () => {
  it('writes the operations and the record together, and says the write is fresh', async () => {
    const outcome = await withWriteRecord(store, HID, 'm1', [{ put: { PK: 'HH#h1', SK: 'X', v: 1 } }], { ok: 1 }, NOW_SECONDS);
    expect(outcome).toEqual({ fresh: true, result: { ok: 1 } });
    expect(await store.get({ PK: 'HH#h1', SK: 'X' })).toMatchObject({ v: 1 });
    expect(await readWriteRecord(store, HID, 'm1')).toEqual({ ok: 1 });
  });

  it('answers a repeat of the same mutation from the record and writes nothing', async () => {
    await withWriteRecord(store, HID, 'm1', [{ put: { PK: 'HH#h1', SK: 'X', v: 1 } }], { first: true }, NOW_SECONDS);
    const again = await withWriteRecord(store, HID, 'm1', [{ put: { PK: 'HH#h1', SK: 'X', v: 2 } }], { second: true }, NOW_SECONDS);
    expect(again).toEqual({ fresh: false, result: { first: true } });
    expect(await store.get({ PK: 'HH#h1', SK: 'X' })).toMatchObject({ v: 1 });
  });

  it('rethrows a failed condition elsewhere and stores no record, so a retry runs again', async () => {
    const missing = { update: { PK: 'HH#h1', SK: 'NOPE' }, set: { a: 1 } };
    await expect(withWriteRecord(store, HID, 'm2', [missing], {}, NOW_SECONDS)).rejects.toBeInstanceOf(ConditionFailedError);
    expect(await readWriteRecord(store, HID, 'm2')).toBeUndefined();
  });

  it('expires the record after 8 days', async () => {
    await withWriteRecord(store, HID, 'm3', [], { ok: true }, NOW_SECONDS);
    expect(await store.get(mutKey(HID, 'm3'))).toMatchObject({ expiresAt: NOW_SECONDS + 8 * 24 * 60 * 60, status: 200 });
  });
});
