import { useEffect, useRef } from 'react';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router';
import type { MoneyChange, MoneyEntry, MoneyKind } from '../../src/money/types';
import { useHousehold } from '~/lib/household';
import { declinedChanges } from '~/lib/money';
import { notifyFields } from '~/lib/letThemKnow';
import { useMoneyMutation } from '~/lib/mutations';

// What the add sheet hands over. It makes `id` and `mutationId` once, when it opens, so a double tap is one entry.
export interface NewMoneyInput {
  id: string;
  mutationId: string;
  kind: MoneyKind;
  description: string;
  on: string;
  money: MoneyChange;
}

export interface MoneyActions {
  add(input: NewMoneyInput): void;
  // A waiting or declined entry takes any of these. An agreed entry takes only the description and date: its money changes through askChange.
  edit(entry: MoneyEntry, changes: { money?: MoneyChange; description?: string; on?: string }): void;
  respond(entry: MoneyEntry, response: 'agree' | 'decline'): void;
  askChange(entry: MoneyEntry, change: { money: MoneyChange } | { delete: true }): void;
  respondChange(entry: MoneyEntry, response: 'agree' | 'decline'): void;
  withdrawChange(entry: MoneyEntry): void;
  remove(entry: MoneyEntry): void;
  restore(entry: MoneyEntry): void;
}

// Every money action the screens can take: each builds its mutation's variables (an id, the time of the tap, who made it, and the
// "Let them know" tick) and runs it by key. Each carries the version or request id the person saw, so a stale one is refused.
export function useMoneyActions(): MoneyActions {
  const household = useHousehold();
  const navigate = useNavigate();
  const add = useMoneyMutation('moneyAdd');
  const edit = useMoneyMutation('moneyEdit');
  const respond = useMoneyMutation('moneyRespond');
  const change = useMoneyMutation('moneyChange');
  const changeRespond = useMoneyMutation('moneyChangeRespond');
  const changeWithdraw = useMoneyMutation('moneyChangeWithdraw');
  const del = useMoneyMutation('moneyDelete');
  const restore = useMoneyMutation('moneyRestore');

  const by = household.data?.me.userId ?? '';
  const common = () => ({ mutationId: crypto.randomUUID(), at: Date.now(), by, ...notifyFields() });
  const toast = (message: string): void => { notifications.show({ id: crypto.randomUUID(), autoClose: 5000, message }); };

  return {
    add: ({ mutationId, id, kind, description, on, money }) => add.mutate({ ...common(), mutationId, entry: { id, kind, description, on, ...money } }),

    edit: (entry, changes) => {
      if (changes.money === undefined && changes.description === undefined && changes.on === undefined) return;
      edit.mutate({
        ...common(), entryId: entry.id,
        ...(changes.money === undefined ? {} : { money: changes.money, baseVersion: entry.version }),
        ...(changes.description === undefined ? {} : { description: changes.description }),
        ...(changes.on === undefined ? {} : { on: changes.on }),
      });
    },

    respond: (entry, response) => respond.mutate({ ...common(), entryId: entry.id, response, version: entry.version }),

    askChange: (entry, asked) => change.mutate({ ...common(), entryId: entry.id, version: entry.version, ...asked }),

    respondChange: (entry, response) => {
      if (!entry.pendingChange) return;
      changeRespond.mutate({ ...common(), entryId: entry.id, response, requestId: entry.pendingChange.id });
    },

    withdrawChange: entry => {
      if (!entry.pendingChange) return;
      changeWithdraw.mutate({ ...common(), entryId: entry.id, requestId: entry.pendingChange.id });
    },

    remove: entry => {
      del.mutate({ ...common(), entryId: entry.id });
      toast(`Deleted: ${entry.description}`);
      navigate('/money');
    },

    restore: entry => {
      if (entry.deletedAt === undefined) return;
      restore.mutate({ ...common(), entries: [{ id: entry.id, deletedAt: entry.deletedAt }] });
      toast(`Restored: ${entry.description}. It waits for the other person to agree.`);
    },
  };
}

// Takes the server's entries, never the overlaid ones: a queued write that settles before its refetch lands would look like a declined request.
// Says "Change not made" when a request of mine ends with nothing changed. The server keeps no trace of a declined request, so this is
// seen as the entry's request going away while its version stays the same.
export function useChangeNotices(entries: MoneyEntry[], me: string): void {
  const previous = useRef<MoneyEntry[] | undefined>(undefined);
  useEffect(() => {
    if (previous.current) {
      for (const entry of declinedChanges(previous.current, entries, me)) {
        notifications.show({ id: `change-not-made-${entry.id}-${entry.updatedAt}`, autoClose: 5000, message: `Change not made: ${entry.description}` });
      }
    }
    previous.current = entries;
  }, [entries, me]);
}
