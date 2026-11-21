import type { EventView } from '../../src/calendar/types';
import type { MoneyEntry } from '../../src/money/types';
import type { Recipe } from '../../src/meals/types';
import type { ShoppingItem } from '../../src/shopping/types';
import type { Task } from '../../src/tasks/types';
import type { ListedProject } from './projects';

// The recycle bin, built from the task list the app already has: tombstones, newest deletion first.
export function deletedTasks(tasks: Task[]): Task[] {
  return tasks.filter(task => task.deletedAt !== undefined).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

const newestFirst = <T extends { deletedAt?: number }>(rows: T[]): T[] =>
  rows.filter(row => row.deletedAt !== undefined).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

// The Deleted page's five groups, each newest deletion first.
export function deletedEntries(
  tasks: Task[], items: ShoppingItem[], recipes: Recipe[], money: MoneyEntry[] = [], events: EventView[] = [],
): { tasks: Task[]; items: ShoppingItem[]; recipes: Recipe[]; money: MoneyEntry[]; events: EventView[] } {
  return { tasks: deletedTasks(tasks), items: newestFirst(items), recipes: newestFirst(recipes), money: newestFirst(money), events: newestFirst(events) };
}

// The Projects group of the Deleted page, newest deletion first. It is a helper and not a sixth argument of `deletedEntries`. Each row
// says what would come back, from the step counts the list already carries.
export function deletedProjectGroup(projects: ListedProject[]): { project: ListedProject; comesBack: string }[] {
  return newestFirst(projects).map(project => {
    const steps = project.counts?.steps ?? 0;
    return { project, comesBack: `${steps} ${steps === 1 ? 'step' : 'steps'}` };
  });
}
