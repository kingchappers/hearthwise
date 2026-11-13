import type { Key, TxOp, UpdateOp } from './types';

const KEY_ATTRIBUTES = new Set(['PK', 'SK']);

export interface PatchPlan {
  fields: [string, unknown][];
  defaults: [string, unknown][];
}

function definedEntries(values: Record<string, unknown>): [string, unknown][] {
  return Object.entries(values).filter(([, value]) => value !== undefined);
}

export function matchesAll(current: Record<string, unknown> | undefined, expected: Record<string, unknown> | undefined): boolean {
  if (expected === undefined) return true;
  if (current === undefined) return false;
  return Object.entries(expected).every(([name, value]) => current[name] === value);
}

export function planPatch(fields: Record<string, unknown>, defaults: Record<string, unknown> = {}): PatchPlan {
  const plan: PatchPlan = { fields: definedEntries(fields), defaults: definedEntries(defaults) };
  if (plan.fields.length + plan.defaults.length === 0) {
    throw new Error('patch needs at least one field');
  }

  const keyAttribute = [...plan.fields, ...plan.defaults].find(([name]) => KEY_ATTRIBUTES.has(name));
  if (keyAttribute) {
    throw new Error(`patch cannot change the key attribute "${keyAttribute[0]}"`);
  }

  const fieldNames = new Set(plan.fields.map(([name]) => name));
  const overlap = plan.defaults.find(([name]) => fieldNames.has(name));
  if (overlap) {
    throw new Error(`patch attribute "${overlap[0]}" is in both fields and defaults`);
  }
  return plan;
}

export function matchesMissing(current: Record<string, unknown> | undefined, names: string[]): boolean {
  if (current === undefined) return true;
  return names.every(name => !(name in current) || current[name] === undefined);
}

export interface UpdatePlan {
  set: [string, unknown][];
  remove: string[];
  ifEquals: [string, unknown][];
  ifMissing: string[];
  mustExist: boolean;
}

export function planUpdate(op: UpdateOp): UpdatePlan {
  const set = definedEntries(op.set ?? {});
  const remove = op.remove ?? [];
  if (set.length + remove.length === 0) {
    throw new Error('update needs at least one attribute to set or remove');
  }

  const keyAttribute = [...set.map(([name]) => name), ...remove].find(name => KEY_ATTRIBUTES.has(name));
  if (keyAttribute) {
    throw new Error(`update cannot change the key attribute "${keyAttribute}"`);
  }

  const setNames = new Set(set.map(([name]) => name));
  const overlap = remove.find(name => setNames.has(name));
  if (overlap) {
    throw new Error(`update attribute "${overlap}" is in both set and remove`);
  }

  const ifEquals = Object.entries(op.ifEquals ?? {});
  const unset = ifEquals.find(([, value]) => value === undefined);
  if (unset) {
    throw new Error(`update condition on "${unset[0]}" has no value: use ifMissing to require an absent attribute`);
  }

  // DynamoDB compares an object or array by structure, the in-process stores by identity, so the same condition would pass
  // on one and never on the other. Conditions are on single values.
  const compound = ifEquals.find(([, value]) => typeof value === 'object' && value !== null);
  if (compound) {
    throw new Error(`update condition on "${compound[0]}" must be a scalar (string, number, boolean or null), not an object or array`);
  }

  return { set, remove, ifEquals, ifMissing: op.ifMissing ?? [], mustExist: op.mustExist ?? true };
}

// The item a transaction op touches.
export function opKey(op: TxOp): Key {
  if ('put' in op) return op.put;
  if ('delete' in op) return op.delete;
  return op.update;
}

// True when the item (or its absence) satisfies every condition of the plan.
export function updateConditionsHold(current: Record<string, unknown> | undefined, plan: UpdatePlan): boolean {
  if (current === undefined && plan.mustExist) return false;
  if (plan.ifEquals.length > 0 && !matchesAll(current, Object.fromEntries(plan.ifEquals))) return false;
  return matchesMissing(current, plan.ifMissing);
}

// The attributes an update leaves behind (the keys are not part of them).
export function applyUpdate(current: Record<string, unknown> | undefined, plan: UpdatePlan): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(current ?? {}) };
  for (const [name, value] of plan.set) next[name] = value;
  for (const name of plan.remove) delete next[name];
  return next;
}
