// The rules for what people see: how tasks are grouped on the Today page, who a task is for, and which one is next. Pure functions.
import { addDays } from '../../src/shared/schedule';
import { effectiveAssignee } from '../../src/tasks/ownership';
import type { Roster } from '../../src/tasks/ownership';
import type { Task } from '../../src/tasks/types';

export { effectiveAssignee };

export type Group = 'today' | 'week' | 'later' | 'whenever';

// The Sunday that ends this Monday-to-Sunday week (today, when today is a Sunday).
export function comingSunday(today: string): string {
  const mondayIndex = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(today, 6 - mondayIndex);
}

const isOpen = (task: Task): boolean => task.deletedAt === undefined && task.status === 'open';
const byDateThenTitle = (a: Task, b: Task): number => (a.dueOn ?? '').localeCompare(b.dueOn ?? '') || a.title.localeCompare(b.title);

export function groupTasks(tasks: Task[], today: string): Record<Group, Task[]> {
  const sunday = comingSunday(today);
  const groups: Record<Group, Task[]> = { today: [], week: [], later: [], whenever: [] };
  for (const task of tasks.filter(isOpen)) {
    if (task.dueOn === undefined) groups.whenever.push(task);
    else if (task.dueOn <= today) groups.today.push(task);
    else if (task.dueOn <= sunday) groups.week.push(task);
    else groups.later.push(task);
  }
  for (const group of Object.values(groups)) group.sort(byDateThenTitle);
  return groups;
}

// The one task to offer next: what is due, then an undated to-do, then the soonest dated one. The viewer's own comes before an either
// or both task of the same day. Tasks set aside with "Not now" are skipped, for this session only.
export function nextThing(tasks: Task[], viewerId: string, today: string, roster: Roster, skipped: string[] = []): Task | undefined {
  const mine = (task: Task): boolean => effectiveAssignee(task, roster) === viewerId;
  const candidates = tasks.filter(task => isOpen(task) && !skipped.includes(task.id) && [viewerId, 'either', 'both'].includes(effectiveAssignee(task, roster)));
  const rank = (task: Task): number => (task.dueOn === undefined ? 1 : task.dueOn <= today ? 0 : 2);
  candidates.sort((a, b) => rank(a) - rank(b) || (a.dueOn ?? '').localeCompare(b.dueOn ?? '') || Number(mine(b)) - Number(mine(a)) || a.title.localeCompare(b.title));
  return candidates[0];
}
