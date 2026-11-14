// Every household mutation is registered here, once, with the query client: its key, its function and the scope that makes household
// writes run one at a time, in order. Components use `useMutation({ mutationKey })` and nothing else, so step 5 can persist and replay
// them from this one place. A household write defined anywhere else would be lost on a reload.
import { MutationObserver, useMutation } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import type { Repeat } from '../../src/shared/schedule';
import { needsProposal } from '../../src/tasks/ownership';
import type { Caller } from '../../src/tasks/ownership';
import type { Change, ChecklistStep, Task } from '../../src/tasks/types';
import { ApiError } from './apiError';
import type { TasksData } from './overlay';
import { ITEMS_KEY } from './items';
import { noteMutationSettled, TASKS_KEY } from './queries';
import { retryDelay, shouldRetry } from './retryRules';

export type MutationKind =
  | 'create' | 'edit' | 'schedule' | 'delete' | 'complete' | 'uncomplete' | 'tick' | 'restore'
  | 'propose' | 'accept' | 'decline' | 'withdraw';

export const mutationKeys: { [K in MutationKind]: readonly ['household', K] } = {
  create: ['household', 'create'], edit: ['household', 'edit'], schedule: ['household', 'schedule'], delete: ['household', 'delete'],
  complete: ['household', 'complete'], uncomplete: ['household', 'uncomplete'], tick: ['household', 'tick'], restore: ['household', 'restore'],
  propose: ['household', 'propose'], accept: ['household', 'accept'], decline: ['household', 'decline'], withdraw: ['household', 'withdraw'],
};

// What every mutation carries: its id (the server's write record key), the client time of the action, and who made it.
interface Common {
  mutationId: string;
  at: number;
  by: string;
}

export interface NewTask {
  id: string;
  title: string;
  notes?: string;
  assignee: string;
  repeat: Repeat;
  dueOn?: string;
  checklist?: ChecklistStep[];
}

export interface MutationVars {
  create: Common & { task: NewTask };
  edit: Common & { taskId: string; title?: string; notes?: string; checklist?: ChecklistStep[] };
  // `dueOn` together with `repeat` is the suggested date for the new rule.
  schedule: Common & { taskId: string; assignee?: string; repeat?: Repeat; dueOn?: string };
  delete: Common & { taskId: string };
  complete: Common & { taskId: string; cycleSeq: number; nextDueOn: string | null };
  uncomplete: Common & { taskId: string; cycleSeq: number; previous: { dueOn?: string; checklistState: Task['checklistState'] } };
  tick: Common & { taskId: string; cycleSeq: number; stepId: string; done: boolean };
  restore: Common & { taskId: string };
  propose: Common & { id: string; taskId: string; change: Change; baseRuleVersionHint: number; baseCycleSeqHint?: number };
  accept: Common & { id: string };
  decline: Common & { id: string };
  withdraw: Common & { id: string };
}

export type ItemMutationKind = 'itemAdd' | 'itemEdit' | 'itemTick' | 'itemDelete' | 'itemClear' | 'itemRestore';

export const itemMutationKeys: { [K in ItemMutationKind]: readonly ['household', K] } = {
  itemAdd: ['household', 'itemAdd'], itemEdit: ['household', 'itemEdit'], itemTick: ['household', 'itemTick'],
  itemDelete: ['household', 'itemDelete'], itemClear: ['household', 'itemClear'], itemRestore: ['household', 'itemRestore'],
};

export interface ItemMutationVars {
  itemAdd: Common & { item: { id: string; text: string; quantity?: string } };
  itemEdit: Common & { itemId: string; text?: string; quantity?: string };
  itemTick: Common & { itemId: string; done: boolean };
  itemDelete: Common & { itemId: string };
  // Each ticked item with the time it was ticked, as this phone saw it: the server keeps one that was changed since.
  itemClear: Common & { entries: { id: string; ifTickedAt: number }[] };
  itemRestore: Common & { itemIds: string[] };
}

type Request = (endpoint: string, options?: RequestInit) => Promise<unknown>;

const send = (request: Request, method: string, path: string, body: object): Promise<unknown> =>
  request(path, { method, body: JSON.stringify(body) });

// The caller's tasks with every earlier pending write applied, but not the write now running (it names itself by its mutation id).
type GetData = (exceptMutationId?: string) => TasksData;

const aboutOneCycle = (change: Change): boolean =>
  change.kind === 'swap' || (change.kind === 'edit' && change.set.dueOn !== undefined && change.set.repeat === undefined);

type Runner<K extends MutationKind> = (vars: MutationVars[K], request: Request, find: (taskId: string) => Task | undefined) => Promise<unknown>;

const RUNNERS: { [K in MutationKind]: Runner<K> } = {
  create: (v, request) => send(request, 'POST', '/api/hh/tasks', { ...v.task, mutationId: v.mutationId, clientAt: v.at }),

  edit: (v, request) => {
    const body: Record<string, unknown> = { mutationId: v.mutationId, clientAt: v.at };
    for (const field of ['title', 'notes', 'checklist'] as const) {
      if (v[field] === undefined) continue;
      body[field] = v[field];
      body[`${field}At`] = v.at;
    }
    return send(request, 'PATCH', `/api/hh/tasks/${v.taskId}`, body);
  },

  tick: (v, request) => send(request, 'PATCH', `/api/hh/tasks/${v.taskId}`, {
    mutationId: v.mutationId, clientAt: v.at, ticks: { cycleSeq: v.cycleSeq, steps: { [v.stepId]: { done: v.done, at: v.at } } },
  }),

  // Base versions are read when the write runs, so earlier pending writes from this phone are already counted.
  schedule: (v, request, find) => {
    const task = find(v.taskId);
    const body: Record<string, unknown> = { mutationId: v.mutationId, clientAt: v.at, baseRuleVersion: task?.ruleVersion ?? 1 };
    if (v.assignee !== undefined) body.assignee = v.assignee;
    if (v.repeat !== undefined) body.repeat = v.repeat;
    if (v.dueOn !== undefined) body.dueOn = v.dueOn;
    if (v.dueOn !== undefined && v.repeat === undefined) body.baseCycleSeq = task?.cycleSeq ?? 1;
    return send(request, 'PATCH', `/api/hh/tasks/${v.taskId}`, body);
  },

  delete: (v, request, find) =>
    send(request, 'DELETE', `/api/hh/tasks/${v.taskId}`, { mutationId: v.mutationId, clientAt: v.at, baseRuleVersion: find(v.taskId)?.ruleVersion ?? 1 }),

  // The cycle the person was shown, not the one the overlay has moved on to.
  complete: (v, request) => send(request, 'POST', `/api/hh/tasks/${v.taskId}/complete`, { mutationId: v.mutationId, clientAt: v.at, cycleSeq: v.cycleSeq, completedAt: v.at }),

  uncomplete: (v, request) => send(request, 'DELETE', `/api/hh/tasks/${v.taskId}/completions/${v.cycleSeq}`, { mutationId: v.mutationId, clientAt: v.at }),

  restore: (v, request) => send(request, 'POST', '/api/hh/restore', { mutationId: v.mutationId, clientAt: v.at, entries: [{ kind: 'task', id: v.taskId }] }),

  propose: (v, request, find) => {
    const task = find(v.taskId);
    const body: Record<string, unknown> = {
      id: v.id, taskId: v.taskId, change: v.change, mutationId: v.mutationId, clientAt: v.at,
      // A task made a moment ago may not be in the data yet: the hint is the version it was created at.
      baseRuleVersion: task?.ruleVersion ?? v.baseRuleVersionHint,
    };
    if (aboutOneCycle(v.change)) body.baseCycleSeq = task?.cycleSeq ?? v.baseCycleSeqHint ?? 1;
    return send(request, 'POST', '/api/hh/proposals', body);
  },

  accept: (v, request) => send(request, 'POST', `/api/hh/proposals/${v.id}/accept`, { mutationId: v.mutationId, clientAt: v.at }),
  decline: (v, request) => send(request, 'POST', `/api/hh/proposals/${v.id}/decline`, { mutationId: v.mutationId, clientAt: v.at }),
  withdraw: (v, request) => send(request, 'POST', `/api/hh/proposals/${v.id}/withdraw`, { mutationId: v.mutationId, clientAt: v.at }),
};

const ITEM_RUNNERS: { [K in ItemMutationKind]: (vars: ItemMutationVars[K], request: Request) => Promise<unknown> } = {
  itemAdd: (v, request) => send(request, 'PUT', `/api/hh/items/${v.item.id}`, {
    mutationId: v.mutationId, clientAt: v.at, text: v.item.text, textAt: v.at,
    ...(v.item.quantity === undefined ? {} : { quantity: v.item.quantity, quantityAt: v.at }),
  }),
  itemEdit: (v, request) => send(request, 'PUT', `/api/hh/items/${v.itemId}`, {
    mutationId: v.mutationId, clientAt: v.at,
    ...(v.text === undefined ? {} : { text: v.text, textAt: v.at }),
    ...(v.quantity === undefined ? {} : { quantity: v.quantity, quantityAt: v.at }),
  }),
  itemTick: (v, request) => send(request, 'PUT', `/api/hh/items/${v.itemId}`, { mutationId: v.mutationId, clientAt: v.at, ticked: v.done, tickedAt: v.at }),
  itemDelete: (v, request) => send(request, 'DELETE', `/api/hh/items/${v.itemId}`, { mutationId: v.mutationId, clientAt: v.at }),
  itemClear: (v, request) => send(request, 'POST', '/api/hh/items/batch', {
    mutationId: v.mutationId, clientAt: v.at, writes: v.entries.map(entry => ({ id: entry.id, delete: true, ifTickedAt: entry.ifTickedAt })),
  }),
  itemRestore: (v, request) => send(request, 'POST', '/api/hh/restore', { mutationId: v.mutationId, clientAt: v.at, entries: v.itemIds.map(id => ({ kind: 'item', id })) }),
};

// What to tell the person when the server refused a write. A network failure, a server error or a lapsed sign-in says nothing here:
// those are retried (retryRules.ts). A write dropped because someone else is now signed in says nothing either.
export function describeFailure(error: unknown): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  if (error.code === 'wrong_user') return undefined;
  if (error.status === 409) return 'This changed on another phone. Please check it and try again.';
  if (error.status === 410) return 'That was deleted on another phone.';
  if (error.status === 403 && error.code === 'proposal_required') return 'That change needs their say. Ask them instead.';
  if (error.status === 401 || error.status >= 500) return undefined;
  return "We couldn't save that change.";
}

// A write the server said needs the other person's say, turned into the proposal it should have been. Only the changes that have a
// proposal form (a schedule change, a delete, a restore) can be asked; an edit of words never needs one.
function askInstead(client: QueryClient, kind: MutationKind, variables: MutationVars[MutationKind]): (() => void) | undefined {
  const taskId = (variables as { taskId?: string }).taskId;
  if (!taskId) return undefined;
  let change: Change | undefined;
  if (kind === 'delete') change = { kind: 'delete' };
  else if (kind === 'restore') change = { kind: 'restore' };
  else if (kind === 'schedule') {
    const { assignee, repeat, dueOn } = variables as MutationVars['schedule'];
    change = { kind: 'edit', set: { ...(assignee === undefined ? {} : { assignee }), ...(repeat === undefined ? {} : { repeat }), ...(dueOn === undefined ? {} : { dueOn }) } };
  }
  if (!change) return undefined;
  const asked = change;
  return () => {
    new MutationObserver(client, { mutationKey: mutationKeys.propose }).mutate({
      mutationId: crypto.randomUUID(), at: Date.now(), by: variables.by, id: crypto.randomUUID(), taskId, change: asked, baseRuleVersionHint: 1,
    } as never).catch(() => undefined);
  };
}

// Writes belong to the person who made them. `guard` says who that is and who is signed in now: a write that finds someone else
// signed in is dropped, never sent, so it cannot go out under another person's name.
export interface OwnerGuard {
  ownerId: string;
  currentUserId: () => string | undefined;
}

function guarded<V, R>(guard: OwnerGuard | undefined, run: (variables: V) => Promise<R>): (variables: V) => Promise<R> {
  return variables => {
    if (guard && guard.currentUserId() !== guard.ownerId) return Promise.reject(new ApiError(403, 'Forbidden', 'wrong_user'));
    return run(variables);
  };
}

// What every household mutation carries so a write survives a bad connection and a reload: online-only (it waits while offline),
// retried by the shared rules, and backed off by them.
const OFFLINE_DEFAULTS = { networkMode: 'online' as const, retry: shouldRetry, retryDelay };

export function registerMutations(
  client: QueryClient, request: Request, getData: GetData, report: (message: string, options?: { ask?: () => void }) => void, guard?: OwnerGuard,
): void {
  for (const kind of Object.keys(mutationKeys) as MutationKind[]) {
    client.setMutationDefaults(mutationKeys[kind], {
      ...OFFLINE_DEFAULTS,
      scope: { id: 'household' },
      mutationFn: guarded(guard, (variables: MutationVars[typeof kind]) => {
        const data = getData(variables.mutationId);
        const run = RUNNERS[kind] as Runner<MutationKind>;
        return run(variables, request, taskId => data.tasks.find(task => task.id === taskId));
      }),
      onError: (error: unknown, variables: MutationVars[typeof kind]) => {
        const message = describeFailure(error);
        if (!message) return;
        const proposalRequired = error instanceof ApiError && error.code === 'proposal_required';
        const ask = proposalRequired ? askInstead(client, kind, variables) : undefined;
        report(message, ask ? { ask } : undefined);
      },
      onSettled: () => {
        noteMutationSettled();
        void client.invalidateQueries({ queryKey: TASKS_KEY });
      },
    });
  }
  for (const kind of Object.keys(itemMutationKeys) as ItemMutationKind[]) {
    client.setMutationDefaults(itemMutationKeys[kind], {
      ...OFFLINE_DEFAULTS,
      scope: { id: 'household' },
      mutationFn: guarded(guard, (variables: ItemMutationVars[typeof kind]) => (ITEM_RUNNERS[kind] as (vars: ItemMutationVars[ItemMutationKind], request: Request) => Promise<unknown>)(variables, request)),
      onError: (error: unknown) => {
        const message = describeFailure(error);
        if (message) report(message);
      },
      onSettled: () => {
        noteMutationSettled();
        void client.invalidateQueries({ queryKey: ITEMS_KEY });
      },
    });
  }
}

// The one way a component runs a household mutation: by key. Its function is the registered default.
export function useHouseholdMutation<K extends MutationKind>(kind: K) {
  return useMutation<unknown, Error, MutationVars[K]>({ mutationKey: mutationKeys[kind] });
}

export function useItemMutation<K extends ItemMutationKind>(kind: K) {
  return useMutation<unknown, Error, ItemMutationVars[K]>({ mutationKey: itemMutationKeys[kind] });
}

export type PlannedMutation =
  | { kind: 'create'; task: NewTask }
  | { kind: 'propose'; id: string; taskId: string; change: Change; baseRuleVersionHint: number };

// A task for the other person (or for both of you) is made as an either task first, then handed over by an edit proposal they can
// accept. They are two queued mutations, so the task shows at once and the ask follows.
export function planCreate(task: NewTask, caller: Caller): PlannedMutation[] {
  if (!needsProposal('create', { assignee: 'either' }, caller, { assignee: task.assignee })) return [{ kind: 'create', task }];
  return [
    { kind: 'create', task: { ...task, assignee: 'either' } },
    { kind: 'propose', id: crypto.randomUUID(), taskId: task.id, change: { kind: 'edit', set: { assignee: task.assignee } }, baseRuleVersionHint: 1 },
  ];
}
