// The pending money mutations shown on top of the server's list. Pure, and it reuses the server's own write rules, so a pending write
// is refused on screen exactly where the server will refuse it: the entry then stays as it was.
import {
  askChange, createEntry, deleteEntry, editEntry, respondToChange, respondToEntry, restoreEntry, withdrawChange,
} from '../../src/money/applyEntry';
import type { Applied } from '../../src/money/applyEntry';
import type { MoneyData, MoneyEntry } from '../../src/money/types';
import { moneyMutationKeys } from './moneyKeys';
import type { MoneyMutationKind } from './moneyKeys';
import type { MoneyMutationVars } from './mutations';
import type { PendingMutation } from './overlay';

type Overlay<K extends MoneyMutationKind> = (data: MoneyData, vars: MoneyMutationVars[K]) => MoneyData;

// Replaces the entry with what the rule made of it. A refusal, or a write that changed nothing, leaves the data as it was.
function change(data: MoneyData, id: string, rule: (entry: MoneyEntry) => Applied): MoneyData {
  const existing = data.entries.find(entry => entry.id === id);
  if (!existing) return data;
  const applied = rule(existing);
  if (!applied.ok || !applied.changed) return data;
  return { ...data, entries: data.entries.map(entry => (entry.id === id ? applied.entry : entry)) };
}

const OVERLAYS: { [K in MoneyMutationKind]: Overlay<K> } = {
  moneyAdd: (data, v) => {
    if (data.entries.some(entry => entry.id === v.entry.id)) return data;
    const { id, kind, description, on, ...money } = v.entry;
    const created = createEntry(id, { kind, money, description: { value: description, at: v.at }, on: { value: on, at: v.at } }, v.by, v.at);
    return created.ok ? { ...data, entries: [...data.entries, created.entry] } : data;
  },

  moneyEdit: (data, v) => change(data, v.entryId, entry => editEntry(entry, {
    ...(v.money === undefined ? {} : { money: v.money, baseVersion: v.baseVersion }),
    ...(v.description === undefined ? {} : { description: { value: v.description, at: v.at } }),
    ...(v.on === undefined ? {} : { on: { value: v.on, at: v.at } }),
  }, v.by, v.at)),

  moneyRespond: (data, v) => change(data, v.entryId, entry => respondToEntry(entry, v.response, v.version, v.by, v.at, v.because)),

  moneyChange: (data, v) => change(data, v.entryId, entry => askChange(entry, {
    id: v.mutationId, version: v.version, ...(v.money === undefined ? {} : { money: v.money }), ...(v.delete === undefined ? {} : { delete: true as const }),
  }, v.by, v.at)),

  moneyChangeRespond: (data, v) => change(data, v.entryId, entry => respondToChange(entry, v.response, v.requestId, v.by, v.at)),
  moneyChangeWithdraw: (data, v) => change(data, v.entryId, entry => withdrawChange(entry, v.requestId, v.by, v.at)),
  moneyDelete: (data, v) => change(data, v.entryId, entry => deleteEntry(entry, v.by, v.at)),

  moneyRestore: (data, v) => v.entries.reduce((current, wanted) => change(current, wanted.id, entry => (
    entry.deletedAt === wanted.deletedAt ? { ok: true, entry: restoreEntry(entry, v.by, v.at), changed: true } : { ok: true, entry, changed: false }
  )), data),
};

function kindOf(mutationKey: readonly unknown[] | undefined): MoneyMutationKind | undefined {
  if (!mutationKey || mutationKey[0] !== 'household') return undefined;
  return (Object.keys(moneyMutationKeys) as MoneyMutationKind[]).find(kind => kind === mutationKey[1]);
}

export function applyPendingMoney(data: MoneyData, pending: PendingMutation[]): MoneyData {
  return pending.reduce((current, mutation) => {
    const kind = kindOf(mutation.mutationKey);
    if (!kind || !mutation.variables) return current;
    return (OVERLAYS[kind] as Overlay<MoneyMutationKind>)(current, mutation.variables as MoneyMutationVars[MoneyMutationKind]);
  }, data);
}
