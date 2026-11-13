// The words the task screens use for dates, people and repeats. Neutral by rule: a task past its date reads "Due", never anything harsher.
import type { Repeat } from '../../src/shared/schedule';
import { normalizedAssignee } from '../../src/tasks/ownership';
import type { Task } from '../../src/tasks/types';

export interface NamedMember {
  userId: string;
  displayName: string;
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function formatDay(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

export function dueLabel(task: Pick<Task, 'dueOn'>, today: string): string | undefined {
  if (task.dueOn === undefined) return undefined;
  if (task.dueOn === today) return 'Due today';
  return task.dueOn < today ? `Due · ${formatDay(task.dueOn)}` : formatDay(task.dueOn);
}

export function memberName(roster: NamedMember[], userId: string): string {
  return roster.find(member => member.userId === userId)?.displayName ?? 'Former member';
}

export function assigneeLabel(task: Task, roster: NamedMember[], viewerId: string): string {
  const who = (userId: string): string => (userId === viewerId ? 'You' : memberName(roster, userId));
  const swapped = task.overrideAssignee !== undefined && task.overrideCycle === task.cycleSeq && roster.some(member => member.userId === task.overrideAssignee);
  if (swapped) return `${who(task.overrideAssignee!)} (this time)`;
  const owner = normalizedAssignee(task.assignee, { members: roster });
  if (owner === 'both') return 'Together';
  if (owner === 'either') return 'Anyone';
  return who(owner);
}

const plural = (n: number, word: string): string => (n === 1 ? word : `${word}s`);

function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

export function repeatLabel(repeat: Repeat): string {
  if (repeat.type === 'none') return "Doesn't repeat";
  if (repeat.type === 'after') return `${repeat.days} ${plural(repeat.days, 'day')} after it is done`;
  const every = repeat.every === 1 ? `Every ${repeat.unit}` : `Every ${repeat.every} ${repeat.unit}s`;
  if (repeat.unit === 'week' && repeat.weekdays?.length) return `${every} on ${repeat.weekdays.map(day => day[0].toUpperCase() + day.slice(1)).join(', ')}`;
  if (repeat.unit === 'month' && repeat.dayOfMonth !== undefined) return `${every} on the ${ordinal(repeat.dayOfMonth)}`;
  return every;
}
