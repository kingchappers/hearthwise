import { useMemo } from 'react';
import { notifications } from '@mantine/notifications';
import { dayInZone, nextDueOn } from '../../src/shared/schedule';
import { needsProposal, otherMemberId } from '../../src/tasks/ownership';
import type { Caller, OwnedAction } from '../../src/tasks/ownership';
import type { Change, Proposal, Task } from '../../src/tasks/types';
import { ToastAction } from '~/components/layout/ToastAction';
import { useHousehold } from '~/lib/household';
import { planCreate, useHouseholdMutation } from '~/lib/mutations';
import type { NewTask } from '~/lib/mutations';
import { usePreferences } from '~/lib/preferences';
import { useTasks } from '~/lib/queries';
import { planSave } from '~/lib/taskChanges';
import type { SaveStep, TaskChanges } from '~/lib/taskChanges';
import { undoAutoClose } from '~/lib/undoDuration';

export interface TaskActions {
  me: { userId: string; displayName: string };
  members: { userId: string; displayName: string }[];
  caller: Caller;
  today: string;
  // Whether this kind of change to this task would be asked of the other person rather than applied.
  needsAsk(action: OwnedAction, task: Pick<Task, 'assignee'>, target?: { assignee?: string }): boolean;
  complete(task: Task): void;
  tick(task: Task, stepId: string, done: boolean): void;
  create(task: NewTask): void;
  save(task: Task, changes: TaskChanges): void;
  remove(task: Task): void;
  restore(task: Task): void;
  swap(task: Task): void;
  accept(proposal: Proposal): void;
  decline(proposal: Proposal): void;
  withdraw(proposal: Proposal): void;
}

// Every action the task screens can take, in one place: it builds each mutation's variables (an id, the time of the tap, who made it)
// and runs it by key. A change that needs the other person's say becomes a proposal, and the person is told they asked.
export function useTaskActions(): TaskActions {
  const household = useHousehold();
  const { today } = useTasks();
  const [preferences] = usePreferences();

  const create = useHouseholdMutation('create');
  const edit = useHouseholdMutation('edit');
  const schedule = useHouseholdMutation('schedule');
  const del = useHouseholdMutation('delete');
  const complete = useHouseholdMutation('complete');
  const uncomplete = useHouseholdMutation('uncomplete');
  const tick = useHouseholdMutation('tick');
  const restore = useHouseholdMutation('restore');
  const propose = useHouseholdMutation('propose');
  const accept = useHouseholdMutation('accept');
  const decline = useHouseholdMutation('decline');
  const withdraw = useHouseholdMutation('withdraw');

  const data = household.data;
  const me = useMemo(() => ({ userId: data?.me.userId ?? '', displayName: data?.me.displayName ?? '' }), [data?.me.userId, data?.me.displayName]);
  const members = useMemo(() => (data?.members ?? []).map(({ userId, displayName }) => ({ userId, displayName })), [data?.members]);
  const caller: Caller = useMemo(() => ({ userId: me.userId, members }), [me.userId, members]);
  const timezone = data?.household.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const otherName = members.find(member => member.userId === otherMemberId(caller))?.displayName ?? 'them';

  const common = () => ({ mutationId: crypto.randomUUID(), at: Date.now(), by: me.userId });

  function toast(text: string, undo?: { label: string; run: () => void }): void {
    const id = crypto.randomUUID();
    notifications.show({
      id,
      autoClose: undo ? undoAutoClose(preferences.undoDuration) : 5000,
      message: undo
        ? <ToastAction text={text} actionLabel={undo.label} onAction={() => { notifications.hide(id); undo.run(); }} />
        : text,
    });
  }

  function askAbout(task: Task, change: Change, id: string = crypto.randomUUID()): void {
    propose.mutate({ ...common(), id, taskId: task.id, change, baseRuleVersionHint: task.ruleVersion, baseCycleSeqHint: task.cycleSeq });
    toast(`Asked ${otherName}`);
  }

  function runStep(step: SaveStep): void {
    if (step.kind === 'edit') {
      edit.mutate({ ...common(), taskId: step.taskId, title: step.title, notes: step.notes, checklist: step.checklist });
    } else if (step.kind === 'schedule') {
      schedule.mutate({ ...common(), taskId: step.taskId, assignee: step.assignee, repeat: step.repeat, dueOn: step.dueOn });
    } else {
      propose.mutate({ ...common(), id: step.id, taskId: step.taskId, change: step.change, baseRuleVersionHint: step.baseRuleVersionHint, baseCycleSeqHint: step.baseCycleSeqHint });
      toast(`Asked ${otherName}`);
    }
  }

  return {
    me, members, caller, today,

    needsAsk: (action, task, target) => needsProposal(action, task, caller, target),

    complete: task => {
      const vars = common();
      const day = dayInZone(vars.at, timezone);
      const cycleSeq = task.cycleSeq;
      complete.mutate({ ...vars, taskId: task.id, cycleSeq, nextDueOn: nextDueOn(task.repeat, task.dueOn, day) });
      toast(`Done: ${task.title}`, {
        label: 'Undo',
        run: () => uncomplete.mutate({ ...common(), taskId: task.id, cycleSeq, previous: { dueOn: task.dueOn, checklistState: task.checklistState } }),
      });
    },

    tick: (task, stepId, done) => tick.mutate({ ...common(), taskId: task.id, cycleSeq: task.cycleSeq, stepId, done }),

    create: newTask => {
      for (const step of planCreate(newTask, caller)) {
        if (step.kind === 'create') create.mutate({ ...common(), task: step.task });
        else propose.mutate({ ...common(), id: step.id, taskId: step.taskId, change: step.change, baseRuleVersionHint: step.baseRuleVersionHint });
      }
      if (needsProposal('create', { assignee: 'either' }, caller, { assignee: newTask.assignee })) toast(`Asked ${otherName}`);
    },

    save: (task, changes) => {
      for (const step of planSave(task, changes, caller).steps) runStep(step);
    },

    remove: task => {
      if (needsProposal('delete', task, caller)) {
        askAbout(task, { kind: 'delete' });
        return;
      }
      del.mutate({ ...common(), taskId: task.id });
      toast(`Deleted: ${task.title}`, { label: 'Undo', run: () => restore.mutate({ ...common(), taskId: task.id }) });
    },

    restore: task => {
      if (needsProposal('restore', task, caller)) {
        askAbout(task, { kind: 'restore' });
        return;
      }
      restore.mutate({ ...common(), taskId: task.id });
      toast(`Restored: ${task.title}`);
    },

    swap: task => askAbout(task, { kind: 'swap' }),

    accept: proposal => accept.mutate({ ...common(), id: proposal.id }),
    decline: proposal => decline.mutate({ ...common(), id: proposal.id }),
    withdraw: proposal => withdraw.mutate({ ...common(), id: proposal.id }),
  };
}

