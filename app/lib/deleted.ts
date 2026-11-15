import type { MoneyEntry } from '../../src/money/types';
import type { Recipe } from '../../src/meals/types';
import type { ShoppingItem } from '../../src/shopping/types';
import type { Task } from '../../src/tasks/types';

// The recycle bin, built from the task list the app already has: tombstones, newest deletion first.
export function deletedTasks(tasks: Task[]): Task[] {
  return tasks.filter(task => task.deletedAt !== undefined).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

const newestFirst = <T extends { deletedAt?: number }>(rows: T[]): T[] =>
  rows.filter(row => row.deletedAt !== undefined).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));

// The Deleted page's four groups, each newest deletion first.
export function deletedEntries(
  tasks: Task[], items: ShoppingItem[], recipes: Recipe[], money: MoneyEntry[] = [],
): { tasks: Task[]; items: ShoppingItem[]; recipes: Recipe[]; money: MoneyEntry[] } {
  return { tasks: deletedTasks(tasks), items: newestFirst(items), recipes: newestFirst(recipes), money: newestFirst(money) };
}
