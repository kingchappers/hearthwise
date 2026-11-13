export interface Key {
  PK: string;
  SK: string;
}

export type Item = Key & Record<string, unknown>;

// An update sets or removes attributes on an existing item, and applies only if every condition holds. It never creates an
// item unless mustExist is false. An attribute left out of `set` (or set to undefined) is never stored as null.
export interface UpdateOp {
  update: Key;
  set?: Record<string, unknown>;
  remove?: string[];
  // Each named attribute must hold exactly this value. Scalars only (string, number, boolean, null): objects and arrays are rejected.
  ifEquals?: Record<string, unknown>;
  // Each named attribute must be absent. A stored null does not count as absent.
  ifMissing?: string[];
  // Defaults to true: the update fails on a missing item.
  mustExist?: boolean;
}

export type TxOp =
  | { put: Item; ifAbsent?: boolean }
  | { delete: Key; ifPresent?: boolean }
  | UpdateOp;

export interface QueryOptions {
  skPrefix?: string;
  skEquals?: string;
  attributes?: string[];
}

export interface PatchOptions {
  mustExist?: boolean;
  // The patch applies only if the item exists and each named attribute still holds exactly this value (checked atomically).
  ifEquals?: Record<string, unknown>;
  defaults?: Record<string, unknown>;
}

export interface Store {
  // consistent asks for a strongly consistent read where the backend has a choice (DynamoDB); others ignore it.
  get(key: Key, opts?: { consistent?: boolean }): Promise<Item | undefined>;
  put(item: Item, opts?: { ifAbsent?: boolean }): Promise<void>;
  patch(key: Key, fields: Record<string, unknown>, opts?: PatchOptions): Promise<Item>;
  delete(key: Key, opts?: { ifPresent?: boolean }): Promise<void>;
  query(pk: string, opts?: QueryOptions): Promise<Item[]>;
  transact(ops: TxOp[]): Promise<void>;
}

export class ConditionFailedError extends Error {
  readonly failedIndex: number | undefined;

  constructor(failedIndex?: number) {
    super(failedIndex === undefined ? 'Condition failed' : `Condition failed on operation ${failedIndex}`);
    this.name = 'ConditionFailedError';
    this.failedIndex = failedIndex;
  }
}
