// Each pending household mutation shown on top of the server's data, as a pure function. The cached data itself is only ever changed
// by a refetch, so a refetch can never hide a write that has not landed yet.
import type { Proposal, Task } from '../../src/tasks/types';
import { mutationKeys } from './mutations';
import type { MutationKind, MutationVars } from './mutations';

export interface TasksData {
  tasks: Task[];
  proposals: Proposal[];
  serverTime: number;
}

export interface PendingMutation {
  mutationKey: readonly unknown[] | undefined;
  variables: unknown;
}

type Overlay<K extends MutationKind> = (data: TasksData, vars: MutationVars[K]) => TasksData;

function changeTask(data: TasksData, taskId: string, change: (task: Task) => Task): TasksData {
  if (!data.tasks.some(task => task.id === taskId)) return data;
  return { ...data, tasks: data.tasks.map(task => (task.id === taskId ? change(task) : task)) };
}

function without<T extends object>(value: T, ...names: (keyof T)[]): T {
  const copy = { ...value };
  for (const name of names) delete copy[name];
  return copy;
}

function changeProposal(data: TasksData, id: string, change: (proposal: Proposal) => Proposal): TasksData {
  return { ...data, proposals: data.proposals.map(proposal => (proposal.id === id ? change(proposal) : proposal)) };
}

const resolve = (status: Proposal['status'], at: number) => (proposal: Proposal): Proposal => ({ ...proposal, status, resolvedAt: at });

const OVERLAYS: { [K in MutationKind]: Overlay<K> } = {
  create: (data, v) => {
    if (data.tasks.some(task => task.id === v.task.id)) return data;
    const task: Task = {
      ...v.task, fieldTimes: { title: v.at }, cycleSeq: 1, ruleVersion: 1, checklist: v.task.checklist ?? [], checklistState: {},
      status: 'open', createdBy: v.by, updatedAt: v.at,
    };
    return { ...data, tasks: [...data.tasks, task] };
  },

  edit: (data, v) => changeTask(data, v.taskId, task => {
    const next = { ...task, fieldTimes: { ...task.fieldTimes } };
    for (const field of ['title', 'notes', 'checklist'] as const) {
      const value = v[field];
      if (value === undefined || v.at <= (task.fieldTimes[field] ?? 0)) continue;
      (next as Record<string, unknown>)[field] = value;
      next.fieldTimes[field] = v.at;
    }
    return next;
  }),

  tick: (data, v) => changeTask(data, v.taskId, task => {
    if (task.cycleSeq !== v.cycleSeq || v.at <= (task.checklistState[v.stepId]?.at ?? 0)) return task;
    return { ...task, checklistState: { ...task.checklistState, [v.stepId]: { done: v.done, at: v.at } } };
  }),

  schedule: (data, v) => changeTask(data, v.taskId, task => {
    let next = task;
    if (v.assignee !== undefined) next = { ...next, assignee: v.assignee };
    if (v.repeat !== undefined) {
      next = without({ ...next, repeat: v.repeat }, 'overrideAssignee', 'overrideCycle');
      if (v.dueOn !== undefined) next = { ...next, dueOn: v.dueOn };
    } else if (v.dueOn !== undefined) {
      next = { ...next, dueOn: v.dueOn };
    }
    return next;
  }),

  delete: (data, v) => changeTask(data, v.taskId, task => (task.deletedAt === undefined ? { ...task, deletedAt: v.at, deletedBy: v.by } : task)),

  restore: (data, v) => changeTask(data, v.taskId, task => without(task, 'deletedAt', 'deletedBy', 'expiresAt')),

  complete: (data, v) => changeTask(data, v.taskId, task => {
    if (task.cycleSeq !== v.cycleSeq) return task;
    const moved = without({ ...task, cycleSeq: task.cycleSeq + 1, checklistState: {} }, 'overrideAssignee', 'overrideCycle');
    if (task.repeat.type === 'none') return { ...moved, status: 'done', doneAt: v.at };
    return v.nextDueOn === null ? moved : { ...moved, dueOn: v.nextDueOn };
  }),

  uncomplete: (data, v) => changeTask(data, v.taskId, task => {
    if (task.cycleSeq !== v.cycleSeq + 1) return task;
    const reopened = without({ ...task, cycleSeq: v.cycleSeq, checklistState: v.previous.checklistState, status: 'open' as const }, 'doneAt');
    return v.previous.dueOn === undefined ? reopened : { ...reopened, dueOn: v.previous.dueOn };
  }),

  propose: (data, v) => ({
    ...data,
    proposals: [...data.proposals, {
      id: v.id, taskId: v.taskId, fromUserId: v.by, toUserId: '', change: v.change, baseRuleVersion: v.baseRuleVersionHint,
      ...(v.baseCycleSeqHint === undefined ? {} : { baseCycleSeq: v.baseCycleSeqHint }), status: 'pending', createdAt: v.at,
    }],
  }),

  accept: (data, v) => {
    const proposal = data.proposals.find(candidate => candidate.id === v.id);
    const accepted = changeProposal(data, v.id, resolve('accepted', v.at));
    if (proposal?.change.kind !== 'swap') return accepted;
    return changeTask(accepted, proposal.taskId, task => ({ ...task, overrideAssignee: proposal.fromUserId, overrideCycle: task.cycleSeq }));
  },
  decline: (data, v) => changeProposal(data, v.id, resolve('declined', v.at)),
  withdraw: (data, v) => changeProposal(data, v.id, resolve('withdrawn', v.at)),
};

function kindOf(mutationKey: readonly unknown[] | undefined): MutationKind | undefined {
  if (!mutationKey || mutationKey[0] !== 'household') return undefined;
  return (Object.keys(mutationKeys) as MutationKind[]).find(kind => kind === mutationKey[1]);
}

export function applyPending(data: TasksData, pending: PendingMutation[]): TasksData {
  return pending.reduce((current, mutation) => {
    const kind = kindOf(mutation.mutationKey);
    if (!kind || !mutation.variables) return current;
    return (OVERLAYS[kind] as Overlay<MutationKind>)(current, mutation.variables as MutationVars[MutationKind]);
  }, data);
}
