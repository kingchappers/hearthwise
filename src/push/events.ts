import type { NotifyEvent } from './notifyOther';

// The wording of a "Let them know" push: short, neutral, and about the change rather than the person's habits.
// `actor` is the display name of whoever made it; `mutationId` makes the tag, so a retry can never be a second push.
const base = (type: string, mutationId: string, title: string, body: string, url: string, ref?: string): NotifyEvent =>
  ({ type, title, body, mutationId, url, ...(ref === undefined ? {} : { ref }) });

export const taskAdded = (actor: string, taskTitle: string, mutationId: string, taskId: string): NotifyEvent => base('task.created', mutationId, `${actor} added a task`, taskTitle, `/tasks/${taskId}`);
export const taskChanged = (actor: string, taskTitle: string, mutationId: string, taskId: string): NotifyEvent => base('task.edited', mutationId, `${actor} changed a task`, taskTitle, `/tasks/${taskId}`);
export const taskDeleted = (actor: string, taskTitle: string, mutationId: string): NotifyEvent => base('task.deleted', mutationId, `${actor} deleted a task`, taskTitle, '/');
export const taskDone = (actor: string, taskTitle: string, mutationId: string, taskId: string, cycleSeq: number): NotifyEvent =>
  base('task.completed', mutationId, `${actor} did ${taskTitle}`, `${taskTitle} is done`, `/tasks/${taskId}`, `${taskId}#${cycleSeq}`);
export const taskProposed = (actor: string, taskTitle: string, mutationId: string): NotifyEvent => base('task.proposed', mutationId, `${actor} asked about a task`, taskTitle, '/');

export const itemTicked = (actor: string, ticked: boolean, itemText: string, mutationId: string): NotifyEvent =>
  base('item.ticked', mutationId, ticked ? `${actor} ticked off an item` : `${actor} unticked an item`, itemText, '/shopping');
export const itemUpdated = (actor: string, itemText: string, mutationId: string): NotifyEvent => base('item.updated', mutationId, `${actor} updated the shopping list`, itemText, '/shopping');
export const itemRemoved = (actor: string, itemText: string, mutationId: string): NotifyEvent => base('item.removed', mutationId, `${actor} removed an item`, itemText, '/shopping');
export const itemsBatch = (actor: string, added: number, changed: number, mutationId: string): NotifyEvent => {
  const total = added + changed;
  const body = changed === 0
    ? `${added} ${added === 1 ? 'item' : 'items'} added to the shopping list`
    : `${total} ${total === 1 ? 'item' : 'items'} changed on the shopping list`;
  return base('item.batch', mutationId, `${actor} updated the shopping list`, body, '/shopping');
};
