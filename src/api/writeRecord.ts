import { ConditionFailedError } from '../store';
import type { Store, TxOp } from '../store';
import { mutKey } from '../tasks/keys';

const WRITE_RECORD_SECONDS = 8 * 24 * 60 * 60;

export interface WriteOutcome<T> {
  // False when the write had already landed: nothing was written, and `result` is what the first call returned.
  fresh: boolean;
  result: T;
}

export async function readWriteRecord<T>(store: Store, householdId: string, mutationId: string): Promise<T | undefined> {
  const record = await store.get(mutKey(householdId, mutationId), { consistent: true });
  return record === undefined ? undefined : record.result as T;
}

// The answer to a retry of a write that already landed, or undefined when this mutation is new. Checked first, before any
// condition on the write itself is read: a retry of a completion would otherwise look like a second person completing.
export async function replayOf<T>(store: Store, householdId: string, mutationId: string): Promise<WriteOutcome<T> | undefined> {
  const stored = await readWriteRecord<T>(store, householdId, mutationId);
  return stored === undefined ? undefined : { fresh: false, result: stored };
}

// Runs `ops` and the write record in one transaction. The record is the last write, so a failed condition on any earlier write
// keeps its index. If the record already exists (a request racing its own retry), nothing is written and the first result returns.
export async function withWriteRecord<T>(
  store: Store, householdId: string, mutationId: string, ops: TxOp[], result: T, nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<WriteOutcome<T>> {
  const record = { ...mutKey(householdId, mutationId), status: 200, result, expiresAt: nowSeconds + WRITE_RECORD_SECONDS };
  try {
    await store.transact([...ops, { put: record, ifAbsent: true }]);
    return { fresh: true, result };
  } catch (error) {
    if (error instanceof ConditionFailedError && error.failedIndex === ops.length) {
      const stored = await readWriteRecord<T>(store, householdId, mutationId);
      if (stored !== undefined) return { fresh: false, result: stored };
    }
    throw error;
  }
}
