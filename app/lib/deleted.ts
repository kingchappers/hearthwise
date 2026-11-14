import type { Task } from '../../src/tasks/types';

// The recycle bin, built from the task list the app already has: tombstones, newest deletion first.
export function deletedTasks(tasks: Task[]): Task[] {
  return tasks.filter(task => task.deletedAt !== undefined).sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0));
}
