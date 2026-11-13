import type { HouseholdContext } from '../household/types';
import { TaskError } from './types';
import type { Task } from './types';

// The writes that can need the other member's approval. Title, notes, checklist, ticks and completions never do.
export type OwnedAction = 'create' | 'schedule' | 'assignee' | 'delete' | 'restore';

const isMember = (ctx: HouseholdContext, userId: string): boolean => ctx.members.some(member => member.userId === userId);

export function otherMemberId(ctx: HouseholdContext): string | undefined {
  return ctx.members.find(member => member.userId !== ctx.userId)?.userId;
}

// Who a task belongs to, as the household is now: a person who left counts as either, and both needs two people.
export function normalizedAssignee(assignee: string, ctx: HouseholdContext): string {
  if (assignee === 'both') return ctx.members.length > 1 ? 'both' : 'either';
  if (assignee === 'either') return 'either';
  return isMember(ctx, assignee) ? assignee : 'either';
}

// Who does it this cycle: an accepted swap while its cycle is current, otherwise the assignee.
export function effectiveAssignee(task: Task, ctx: HouseholdContext): string {
  const swapped = task.overrideAssignee !== undefined && task.overrideCycle === task.cycleSeq && isMember(ctx, task.overrideAssignee);
  return swapped ? task.overrideAssignee! : normalizedAssignee(task.assignee, ctx);
}

// Whether the task is the other member's, which is what makes a title or checklist edit leave a note in its history.
export function isOtherMembersTask(task: Pick<Task, 'assignee'>, ctx: HouseholdContext): boolean {
  const other = otherMemberId(ctx);
  return other !== undefined && normalizedAssignee(task.assignee, ctx) === other;
}

export function needsProposal(action: OwnedAction, task: Pick<Task, 'assignee'>, ctx: HouseholdContext, target?: { assignee?: string }): boolean {
  const other = otherMemberId(ctx);
  if (other === undefined) return false;
  const owner = normalizedAssignee(task.assignee, ctx);
  const theirs = owner === other || owner === 'both';
  const targetsThem = (assignee: string | undefined): boolean => {
    if (assignee === undefined) return false;
    const normalized = normalizedAssignee(assignee, ctx);
    return normalized === other || normalized === 'both';
  };
  if (action === 'create') return targetsThem(target?.assignee);
  if (action === 'assignee') return theirs || targetsThem(target?.assignee);
  return theirs;
}

export function assertDirect(action: OwnedAction, task: Pick<Task, 'assignee'>, ctx: HouseholdContext, target?: { assignee?: string }): void {
  if (needsProposal(action, task, ctx, target)) throw new TaskError('proposal_required', 403, { toUserId: otherMemberId(ctx) });
}

// An assignee must be either, both, or someone in the household now. A user id that is not a member (yet) is refused rather than
// read as either, or a task could be given to a person before they join, and be theirs without their say.
export function assertKnownAssignee(assignee: string, ctx: HouseholdContext, field = 'assignee'): void {
  if (assignee === 'either' || assignee === 'both' || isMember(ctx, assignee)) return;
  throw new TaskError('invalid', 400, { field });
}
