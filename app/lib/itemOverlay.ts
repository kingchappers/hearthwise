// The pending shopping mutations shown on top of the server's list. Pure, and it reuses the server's own write rule, so an older
// tick loses to a newer one on screen exactly as it will on the server.
import { applyItemDelete, applyItemWrite } from '../../src/shopping/apply';
import type { ShoppingItem } from '../../src/shopping/types';
import { itemMutationKeys } from './mutations';
import type { ItemMutationKind, ItemMutationVars } from './mutations';
import type { PendingMutation } from './overlay';

export interface ItemsData {
  items: ShoppingItem[];
  serverTime: number;
}

type Overlay<K extends ItemMutationKind> = (data: ItemsData, vars: ItemMutationVars[K]) => ItemsData;

function changeItem(data: ItemsData, id: string, change: (item: ShoppingItem) => ShoppingItem | undefined): ItemsData {
  if (!data.items.some(item => item.id === id)) return data;
  return { ...data, items: data.items.map(item => (item.id === id ? (change(item) ?? item) : item)) };
}

const OVERLAYS: { [K in ItemMutationKind]: Overlay<K> } = {
  itemAdd: (data, v) => {
    if (data.items.some(item => item.id === v.item.id)) return data;
    const write = { text: { value: v.item.text, at: v.at }, ...(v.item.quantity === undefined ? {} : { quantity: { value: v.item.quantity, at: v.at } }) };
    const { item } = applyItemWrite(undefined, v.item.id, write, v.by, v.at);
    return item ? { ...data, items: [...data.items, item] } : data;
  },
  itemEdit: (data, v) => changeItem(data, v.itemId, item => applyItemWrite(item, v.itemId, {
    ...(v.text === undefined ? {} : { text: { value: v.text, at: v.at } }),
    ...(v.quantity === undefined ? {} : { quantity: { value: v.quantity, at: v.at } }),
  }, v.by, v.at).item),
  itemTick: (data, v) => changeItem(data, v.itemId, item => applyItemWrite(item, v.itemId, { ticked: { value: v.done, at: v.at } }, v.by, v.at).item),
  itemDelete: (data, v) => changeItem(data, v.itemId, item => applyItemDelete(item, v.by, v.at).item),
  itemClear: (data, v) => v.entries.reduce((current, entry) => changeItem(current, entry.id, item => {
    const outcome = applyItemDelete(item, v.by, v.at, entry.ifTickedAt);
    return outcome.result === 'applied' ? outcome.item : undefined;
  }), data),
  itemRestore: (data, v) => v.itemIds.reduce((current, id) => changeItem(current, id, item => {
    const restored = { ...item };
    delete restored.deletedAt;
    delete restored.deletedBy;
    delete restored.expiresAt;
    return restored;
  }), data),
};

function kindOf(mutationKey: readonly unknown[] | undefined): ItemMutationKind | undefined {
  if (!mutationKey || mutationKey[0] !== 'household') return undefined;
  return (Object.keys(itemMutationKeys) as ItemMutationKind[]).find(kind => kind === mutationKey[1]);
}

export function applyPendingItems(data: ItemsData, pending: PendingMutation[]): ItemsData {
  return pending.reduce((current, mutation) => {
    const kind = kindOf(mutation.mutationKey);
    if (!kind || !mutation.variables) return current;
    return (OVERLAYS[kind] as Overlay<ItemMutationKind>)(current, mutation.variables as ItemMutationVars[ItemMutationKind]);
  }, data);
}
