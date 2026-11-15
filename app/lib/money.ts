import { useMemo } from 'react';
import { useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MoneyData, MoneyEntry } from '../../src/money/types';
import { computeTotal, isCounted, loanProgress, participants, settledIds } from '../../src/shared/ledger';
import type { Total } from '../../src/shared/ledger';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { useHousehold } from './household';
import type { MemberSummary } from './household';
import { MONEY_KEY, moneyMutationKeys } from './moneyKeys';
import { applyPendingMoney } from './moneyOverlay';
import type { MoneyMutationVars } from './mutations';
import type { PendingMutation } from './overlay';
import { currentSettledCount } from './queries';

export { MONEY_KEY };

const POLL_MS = 10_000;
export const FORMER_MEMBER = 'Former member';

export interface LedgerPair {
  otherId: string | undefined;
  otherName: string;
  // Writes need exactly two members, and every person named in the ledger must be one of them.
  canWrite: boolean;
}

// The other person for reading: the one the ledger names besides me, or else the household's other member. Their name falls back to
// "Former member" when they are not a member now.
export function ledgerPair(entries: MoneyEntry[], me: string, members: Pick<MemberSummary, 'userId' | 'displayName'>[]): LedgerPair {
  const named = participants(entries);
  const otherId = named.find(id => id !== me) ?? members.find(member => member.userId !== me)?.userId;
  const otherName = members.find(member => member.userId === otherId && otherId !== me)?.displayName ?? FORMER_MEMBER;
  const canWrite = members.length === 2 && named.every(id => members.some(member => member.userId === id));
  return { otherId, otherName, canWrite };
}

export interface LoanLine {
  loan: MoneyEntry;
  // Up to the loan's amount: a payment above it still counts in the total.
  progress: number;
  paidBack: boolean;
}

export function loanLines(entries: MoneyEntry[]): LoanLine[] {
  return entries.filter(entry => entry.kind === 'loan' && isCounted(entry)).map(loan => {
    const progress = loanProgress(entries, loan.id);
    return { loan, progress: Math.min(progress, loan.amountPence), paidBack: progress >= loan.amountPence };
  });
}

const newestFirst = (a: MoneyEntry, b: MoneyEntry): number => (a.on === b.on ? b.createdAt - a.createdAt : a.on < b.on ? 1 : -1);
const lastChangedFirst = (a: MoneyEntry, b: MoneyEntry): number => b.updatedAt - a.updatedAt;

export interface Sections {
  waitingForMe: MoneyEntry[];
  waitingForOther: MoneyEntry[];
  needsLook: MoneyEntry[];
  loans: LoanLine[];
  entries: MoneyEntry[];
  // How many settled entries are tucked away.
  hidden: number;
}

// What the Money page lists. An agreed entry always stays in its own list; a change request on it is listed again as waiting.
export function sectionsFor(all: MoneyEntry[], me: string, settled: ReadonlySet<string>, showSettled: boolean): Sections {
  const live = all.filter(entry => entry.deletedAt === undefined);
  const shown = (entry: MoneyEntry): boolean => showSettled || !settled.has(entry.id);
  const agreed = live.filter(entry => entry.status === 'agreed');

  const waitingForMe = live.filter(entry => (entry.status === 'waiting' && entry.proposedBy !== me) || (entry.status === 'agreed' && entry.pendingChange && entry.pendingChange.by !== me));
  const waitingForOther = live.filter(entry => (entry.status === 'waiting' && entry.proposedBy === me) || (entry.status === 'agreed' && entry.pendingChange?.by === me));
  const needsLook = live.filter(entry => entry.status === 'declined' && entry.proposedBy === me);
  const answered = live.filter(entry => entry.status === 'declined' && entry.proposedBy !== me);

  return {
    waitingForMe: waitingForMe.sort(lastChangedFirst),
    waitingForOther: waitingForOther.sort(lastChangedFirst),
    needsLook: needsLook.sort(lastChangedFirst),
    loans: loanLines(live).filter(line => shown(line.loan)).sort((a, b) => newestFirst(a.loan, b.loan)),
    entries: [...agreed.filter(entry => entry.kind !== 'loan' && shown(entry)), ...answered].sort(newestFirst),
    hidden: showSettled ? 0 : agreed.filter(entry => settled.has(entry.id)).length,
  };
}

// The agreed loans the sender borrowed that are not yet paid back: what a payment from them can name.
export function openLoansFor(entries: MoneyEntry[], senderId: string): MoneyEntry[] {
  return loanLines(entries).filter(line => !line.paidBack && line.loan.paidBy !== senderId).map(line => line.loan);
}

// A live payment (waiting, agreed or declined) with the same sender, amount and date: a hint, never a block.
export function duplicatePayment(entries: MoneyEntry[], draft: { paidBy: string; amountPence: number; on: string }, exceptId?: string): MoneyEntry | undefined {
  return entries.find(entry => entry.kind === 'payment' && entry.deletedAt === undefined && entry.id !== exceptId
    && entry.paidBy === draft.paidBy && entry.amountPence === draft.amountPence && entry.on === draft.on);
}

export interface MoneyState {
  status: 'loading' | 'ready' | 'error';
  // Every entry as the person sees it, deleted ones too, with every pending write laid over.
  entries: MoneyEntry[];
  me: string;
  other: { userId: string | undefined; name: string };
  canWrite: boolean;
  total: Total;
  loans: LoanLine[];
  settled: ReadonlySet<string>;
  // How many money writes are waiting to be saved, and which entries they are about.
  unsaved: number;
  unsavedIds: ReadonlySet<string>;
  dataUpdatedAt: number | undefined;
  refetch: () => void;
}

function entryIdOf(kind: string | undefined, variables: unknown): string | undefined {
  if (kind === 'moneyAdd') return (variables as MoneyMutationVars['moneyAdd']).entry.id;
  if (kind === 'moneyRestore') return undefined;
  return (variables as { entryId?: string }).entryId;
}

// The household's money as the person sees it: the server's list with every pending write laid over it, polled every 10 seconds while
// the app is visible, like tasks, shopping and the plan. The total, loans and settled set are worked out from the overlaid entries.
export function useMoney(): MoneyState {
  const { request } = useProtectedApi();
  const client = useQueryClient();
  const household = useHousehold();

  const query = useQuery({
    queryKey: MONEY_KEY,
    queryFn: async (): Promise<MoneyData> => {
      const startedAt = currentSettledCount();
      const fresh = await request('/api/hh/money') as MoneyData;
      const previous = client.getQueryData<MoneyData>(MONEY_KEY);
      // A response that started before a write settled may not include it: keep what is on screen.
      return currentSettledCount() !== startedAt && previous ? previous : fresh;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const pending = useMutationState<PendingMutation>({
    filters: { status: 'pending', mutationKey: ['household'] },
    select: mutation => ({ mutationKey: mutation.options.mutationKey, variables: mutation.state.variables }),
  });
  const moneyPending = useMemo(() => pending.filter(mutation => typeof mutation.mutationKey?.[1] === 'string' && mutation.mutationKey[1] in moneyMutationKeys), [pending]);
  const data = useMemo(() => (query.data ? applyPendingMoney(query.data, moneyPending) : undefined), [query.data, moneyPending]);

  const me = household.data?.me.userId ?? '';
  const members = household.data?.members ?? [];
  const entries = data?.entries ?? [];
  const pair = ledgerPair(entries, me, members);

  const computed = useMemo(() => ({
    total: computeTotal(entries, me, pair.otherId ?? ''),
    loans: loanLines(entries),
    settled: settledIds(entries),
  }), [entries, me, pair.otherId]);

  const unsavedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const { mutationKey, variables } of moneyPending) {
      if (mutationKey?.[1] === 'moneyRestore') {
        for (const restored of (variables as MoneyMutationVars['moneyRestore']).entries) ids.add(restored.id);
        continue;
      }
      const id = entryIdOf(mutationKey?.[1] as string | undefined, variables);
      if (id !== undefined) ids.add(id);
    }
    return ids;
  }, [moneyPending]);

  return {
    status: data ? 'ready' : query.isError ? 'error' : 'loading',
    entries,
    me,
    other: { userId: pair.otherId, name: pair.otherName },
    canWrite: pair.canWrite,
    ...computed,
    unsaved: moneyPending.length,
    unsavedIds,
    dataUpdatedAt: query.dataUpdatedAt || undefined,
    refetch: () => { void query.refetch(); },
  };
}
