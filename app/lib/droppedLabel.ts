// Names the thing a refused change was about, so the notice can say which change it was. The words come from the write itself, or from
// what is already on the phone for the id it names. Nothing here is sent anywhere.
import type { QueryClient } from '@tanstack/react-query';
import { ITEMS_KEY } from './items';
import type { ItemsData } from './itemOverlay';
import { projectKey } from './projectKeys';
import type { TasksData } from './overlay';

type Vars = Record<string, unknown>;

const NOUNS: [string, string][] = [
  ['item', 'a shopping item'], ['recipe', 'a recipe'], ['plan', 'a dinner'], ['money', 'a money entry'], ['event', 'an event'],
  ['reminders', 'an event'], ['project', 'a project'], ['step', 'a project step'], ['material', 'a project material'],
];

const nounFor = (kind: string): string => NOUNS.find(([prefix]) => kind.toLowerCase().startsWith(prefix))?.[1] ?? 'a task';
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined);
const nested = (value: unknown, key: string): unknown => (typeof value === 'object' && value !== null ? (value as Vars)[key] : undefined);

// The words of what was changed, or undefined when the phone does not know them.
export function labelOf(kind: string, vars: Vars, client: QueryClient, tasks?: () => TasksData): string | undefined {
  const own = text(vars.title) ?? text(vars.text) ?? text(vars.description) ?? text(nested(vars.task, 'title')) ?? text(nested(vars.item, 'text'))
    ?? text(nested(vars.recipe, 'title')) ?? text(nested(vars.entry, 'description')) ?? text(nested(vars.event, 'title'))
    ?? text(nested(vars.changes, 'title')) ?? text(nested(vars.changes, 'text'));
  if (own) return own;
  if (typeof vars.taskId === 'string') return text(tasks?.().tasks.find(task => task.id === vars.taskId)?.title);
  if (typeof vars.itemId === 'string') return text(client.getQueryData<ItemsData>(ITEMS_KEY)?.items.find(item => item.id === vars.itemId)?.text);
  if (typeof vars.projectId === 'string') {
    const detail = client.getQueryData<{ project?: { title: string }; steps?: { id: string; text: string }[] }>(projectKey(vars.projectId));
    return text(detail?.steps?.find(step => step.id === vars.stepId)?.text) ?? text(detail?.project?.title);
  }
  return undefined;
}

// "Milk" was not saved. Or, when the words are not known, "A change to a recipe was not saved."
export function notSavedLine(kind: string, label: string | undefined): string {
  return label === undefined ? `A change to ${nounFor(kind)} was not saved.` : `"${label.length > 60 ? `${label.slice(0, 57)}...` : label}" was not saved.`;
}
