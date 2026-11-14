import { notifications } from '@mantine/notifications';
import type { ShoppingItem } from '../../src/shopping/types';
import { ToastAction } from '~/components/layout/ToastAction';
import { useHousehold } from '~/lib/household';
import { notifyFields } from '~/lib/letThemKnow';
import { useItemMutation } from '~/lib/mutations';
import { usePreferences } from '~/lib/preferences';
import { undoAutoClose } from '~/lib/undoDuration';

export interface ItemActions {
  add(text: string, quantity?: string): void;
  tick(item: ShoppingItem, done: boolean): void;
  edit(item: ShoppingItem, changes: { text?: string; quantity?: string }): void;
  remove(item: ShoppingItem): void;
  clearTicked(items: ShoppingItem[]): void;
  restore(item: ShoppingItem): void;
}

// Every shopping action the screens can take: each builds its mutation's variables (an id, the time of the tap, who made it) and runs
// it by key. Deleting and clearing show a message with Undo, which restores through the same route as the Deleted page.
export function useItemActions(): ItemActions {
  const household = useHousehold();
  const [preferences] = usePreferences();
  const add = useItemMutation('itemAdd');
  const edit = useItemMutation('itemEdit');
  const tick = useItemMutation('itemTick');
  const del = useItemMutation('itemDelete');
  const clear = useItemMutation('itemClear');
  const restore = useItemMutation('itemRestore');

  const by = household.data?.me.userId ?? '';
  const common = () => ({ mutationId: crypto.randomUUID(), at: Date.now(), by, ...notifyFields() });

  function toast(text: string, undo?: () => void): void {
    const id = crypto.randomUUID();
    notifications.show({
      id,
      autoClose: undo ? undoAutoClose(preferences.undoDuration) : 5000,
      message: undo ? <ToastAction text={text} actionLabel="Undo" onAction={() => { notifications.hide(id); undo(); }} /> : text,
    });
  }

  return {
    add: (text, quantity) => add.mutate({ ...common(), item: { id: crypto.randomUUID(), text, ...(quantity === undefined ? {} : { quantity }) } }),

    tick: (item, done) => tick.mutate({ ...common(), itemId: item.id, done }),

    edit: (item, changes) => edit.mutate({ ...common(), itemId: item.id, ...changes }),

    remove: item => {
      del.mutate({ ...common(), itemId: item.id });
      toast(`Deleted: ${item.text}`, () => restore.mutate({ ...common(), itemIds: [item.id] }));
    },

    clearTicked: items => {
      const ticked = items.filter(item => item.ticked && item.deletedAt === undefined);
      if (ticked.length === 0) return;
      clear.mutate(
        { ...common(), entries: ticked.map(item => ({ id: item.id, ifTickedAt: item.fieldTimes.ticked ?? 0 })) },
        {
          onSuccess: result => {
            const results = (result as { results?: { id: string; status: string }[] } | null)?.results ?? [];
            const skipped = results.filter(entry => entry.status === 'skipped').length;
            if (skipped > 0) toast(`${skipped} ${skipped === 1 ? 'item' : 'items'} kept: changed on another phone`);
          },
        },
      );
      toast(`Cleared ${ticked.length} ticked ${ticked.length === 1 ? 'item' : 'items'}`, () => restore.mutate({ ...common(), itemIds: ticked.map(item => item.id) }));
    },

    restore: item => {
      restore.mutate({ ...common(), itemIds: [item.id] });
      toast(`Restored: ${item.text}`);
    },
  };
}
