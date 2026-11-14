import type { ShoppingItem } from '../../src/shopping/types';
import type { Task } from '../../src/tasks/types';

// The recycle bin, built from the task list the app already has: tombstones, newest deletion first.
export function deletedTasks(tasks: Task[]): Task[] {
  return tasks.filter(task => task.deletedAt !== undefined).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}

// The Deleted page's two groups, each newest deletion first.
export function deletedEntries(tasks: Task[], items: ShoppingItem[]): { tasks: Task[]; items: ShoppingItem[] } {
  return {
    tasks: deletedTasks(tasks),
    items: items.filter(item => item.deletedAt !== undefined).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)),
  };
}
