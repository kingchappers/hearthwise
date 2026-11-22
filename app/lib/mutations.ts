// Every household mutation is registered here, once, with the query client: its key, its function and the scope that makes household
// writes run one at a time, in order. Components use `useMutation({ mutationKey })` and nothing else, so step 5 can persist and replay
// them from this one place. A household write defined anywhere else would be lost on a reload.
import type { Energy } from '../../src/shared/energy';
import { MutationObserver, useMutation } from '@tanstack/react-query';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type { EventKind, People, Reminder, Schedule } from '../../src/calendar/types';
import type { MealType } from '../../src/meals/types';
import type { MoneyChange, MoneyKind } from '../../src/money/types';
import type { ProjectStatus, StepState } from '../../src/projects/types';
import type { Repeat } from '../../src/shared/schedule';
import { needsProposal } from '../../src/tasks/ownership';
import type { Caller } from '../../src/tasks/ownership';
import type { Change, ChecklistStep, Task } from '../../src/tasks/types';
import { ApiError } from './apiError';
import { CALENDAR_KEY, calendarMutationKeys } from './calendarKeys';
import type { CalendarMutationKind } from './calendarKeys';
import { calendarFailureText } from './calendarText';
import type { TasksData } from './overlay';
import { HOUSEHOLD_KEY } from './household';
import type { HouseholdData } from './household';
import { ITEMS_KEY } from './items';
import { MONEY_KEY, moneyMutationKeys } from './moneyKeys';
import { moneyFailureText } from './moneyText';
import type { MoneyMutationKind } from './moneyKeys';
import { noteMutationSettled, TASKS_KEY } from './queries';
import { PROJECT_KEY_PREFIX, PROJECTS_KEY, projectKey as projectDetailKey, projectMutationKeys } from './projectKeys';
import type { ProjectMutationKind } from './projectKeys';
import { addNotice, rememberSaved } from './projectNotices';
import { alreadyHas, plannedText } from './projectText';
import { formatPounds } from '../../src/shared/money';
import { markRefused, removeDraft, NEW_DRAFT } from './recipeDraft';
import type { RecipeChanges } from './recipeFields';
import { PLAN_KEY } from './planKeys';
import { RECIPES_KEY } from './recipeKeys';
import { retryDelay, shouldRetry } from './retryRules';

export { calendarMutationKeys, moneyMutationKeys, projectMutationKeys };
export type { CalendarMutationKind, MoneyMutationKind, ProjectMutationKind };

export type MutationKind =
  | 'create' | 'edit' | 'schedule' | 'delete' | 'complete' | 'uncomplete' | 'tick' | 'restore'
  | 'propose' | 'accept' | 'decline' | 'withdraw';

export const mutationKeys: { [K in MutationKind]: readonly ['household', K] } = {
  create: ['household', 'create'], edit: ['household', 'edit'], schedule: ['household', 'schedule'], delete: ['household', 'delete'],
  complete: ['household', 'complete'], uncomplete: ['household', 'uncomplete'], tick: ['household', 'tick'], restore: ['household', 'restore'],
  propose: ['household', 'propose'], accept: ['household', 'accept'], decline: ['household', 'decline'], withdraw: ['household', 'withdraw'],
};

// What every mutation carries: its id (the server's write record key), the client time of the action, who made it, and whether they
// ticked "Let them know" for it.
interface Common {
  mutationId: string;
  at: number;
  by: string;
  notify?: boolean;
}

export interface NewTask {
  id: string;
  title: string;
  notes?: string;
  energy?: Energy;
  assignee: string;
  repeat: Repeat;
  dueOn?: string;
  checklist?: ChecklistStep[];
}

export interface MutationVars {
  create: Common & { task: NewTask };
  edit: Common & { taskId: string; title?: string; notes?: string; energy?: Energy | 'none'; checklist?: ChecklistStep[] };
  // `dueOn` together with `repeat` is the suggested date for the new rule.
  schedule: Common & { taskId: string; assignee?: string; repeat?: Repeat; dueOn?: string };
  delete: Common & { taskId: string };
  complete: Common & { taskId: string; cycleSeq: number; nextDueOn: string | null };
  uncomplete: Common & { taskId: string; cycleSeq: number; previous: { dueOn?: string; checklistState: Task['checklistState'] } };
  tick: Common & { taskId: string; cycleSeq: number; stepId: string; done: boolean };
  restore: Common & { taskId: string };
  propose: Common & { id: string; taskId: string; change: Change; baseRuleVersionHint: number; baseCycleSeqHint?: number };
  accept: Common & { id: string };
  decline: Common & { id: string };
  withdraw: Common & { id: string };
}

export type ItemMutationKind = 'itemAdd' | 'itemEdit' | 'itemTick' | 'itemDelete' | 'itemClear' | 'itemRestore' | 'itemsFromPlan';

export const itemMutationKeys: { [K in ItemMutationKind]: readonly ['household', K] } = {
  itemAdd: ['household', 'itemAdd'], itemEdit: ['household', 'itemEdit'], itemTick: ['household', 'itemTick'],
  itemDelete: ['household', 'itemDelete'], itemClear: ['household', 'itemClear'], itemRestore: ['household', 'itemRestore'],
  itemsFromPlan: ['household', 'itemsFromPlan'],
};

export interface ItemMutationVars {
  itemAdd: Common & { item: { id: string; text: string; quantity?: string } };
  itemEdit: Common & { itemId: string; text?: string; quantity?: string };
  itemTick: Common & { itemId: string; done: boolean };
  itemDelete: Common & { itemId: string };
  // Each ticked item with the time it was ticked, as this phone saw it: the server keeps one that was changed since.
  itemClear: Common & { entries: { id: string; ifTickedAt: number }[] };
  itemRestore: Common & { itemIds: string[] };
  // The review's shopping lines, and the plan days they were made from. The days are as the client saw them, so the server marks a day
  // only if its dinner is still the one added.
  itemsFromPlan: Common & {
    days: { day: string; title: string; recipeId?: string; servings?: number }[];
    lines: { id: string; text: string; quantity?: string; forRecipes?: string }[];
  };
}

export type RecipeMutationKind = 'recipeAdd' | 'recipeEdit' | 'recipeDelete' | 'recipeRestore';
export type MealMutationKind = RecipeMutationKind | 'planSet';

export const mealMutationKeys: { [K in MealMutationKind]: readonly ['household', K] } = {
  recipeAdd: ['household', 'recipeAdd'], recipeEdit: ['household', 'recipeEdit'], recipeDelete: ['household', 'recipeDelete'], recipeRestore: ['household', 'recipeRestore'],
  planSet: ['household', 'planSet'],
};

export interface NewRecipe {
  id: string;
  title: string;
  mealType?: MealType;
  servings?: number;
  minutes?: number;
  lowEnergy?: boolean;
  nutrition?: string;
  ingredients?: string[];
  steps?: string[];
}

export interface MealMutationVars {
  recipeAdd: Common & { recipe: NewRecipe };
  // Only the fields the person changed.
  recipeEdit: Common & { recipeId: string; changes: RecipeChanges };
  recipeDelete: Common & { recipeId: string };
  recipeRestore: Common & { recipeIds: string[] };
  // A dinner on a plan day, or null to clear the day.
  planSet: Common & { day: string; meal: { recipeId?: string; title: string; servings?: number } | null };
}

export interface NewMoneyEntry extends MoneyChange {
  id: string;
  kind: MoneyKind;
  description: string;
  // YYYY-MM-DD.
  on: string;
}

export interface MoneyMutationVars {
  moneyAdd: Common & { entry: NewMoneyEntry };
  // The money group goes with the version it was based on; the description and date are sent only when they changed.
  moneyEdit: Common & { entryId: string; money?: MoneyChange; baseVersion?: number; description?: string; on?: string };
  moneyRespond: Common & { entryId: string; response: 'agree' | 'decline'; version: number };
  // The request is named by this write's own mutation id, which is what the other person answers.
  moneyChange: Common & { entryId: string; version: number; money?: MoneyChange; delete?: true };
  moneyChangeRespond: Common & { entryId: string; response: 'agree' | 'decline'; requestId: string };
  moneyChangeWithdraw: Common & { entryId: string; requestId: string };
  moneyDelete: Common & { entryId: string };
  // Each entry with the deletion the person saw, so a restore queued before a later change applies nothing they did not see.
  moneyRestore: Common & { entries: { id: string; deletedAt: number }[] };
}

export interface NewEvent {
  id: string;
  kind: EventKind;
  title: string;
  place?: string;
  notes?: string;
  schedule: Schedule;
  people: People;
}

export interface CalendarMutationVars {
  createEvent: Common & { event: NewEvent };
  // Only the groups the person changed. An empty `place` or `notes` clears it.
  editEvent: Common & { eventId: string; title?: string; place?: string; notes?: string; schedule?: Schedule; people?: People };
  deleteEvent: Common & { eventId: string };
  // The caller's own list: it replaces their reminders on the event, and an empty one clears them.
  setReminders: Common & { eventId: string; list: Reminder[] };
  // Each event with the deletion the person saw, so a restore queued before a later change applies nothing they did not see.
  eventRestore: Common & { entries: { id: string; deletedAt: number }[] };
}

// A project's or a step's changed fields. `null` clears an optional one.
// The planned day: a start and an optional end, written together. `plannedOn: null` clears both.
export interface PlannedChange { plannedOn: string | null; plannedEndOn?: string | null }
// A cost figure is whole pence from 1, or `null` to clear it. Each has its own time.
export interface ProjectChanges { title?: string; notes?: string | null; status?: ProjectStatus; planned?: PlannedChange; estimatePence?: number | null; spentPence?: number | null }
export interface StepChanges { text?: string; note?: string | null; energy?: Energy | null; state?: StepState; position?: string }

export interface ProjectMutationVars {
  putProject: Common & { projectId: string; changes: ProjectChanges };
  deleteProject: Common & { projectId: string };
  // Each project with the deletion the person saw, so a restore queued before a later change applies nothing they did not see.
  restoreProject: Common & { entries: { id: string; deletedAt: number }[] };
  takeProject: Common & { projectId: string };
  releaseProject: Common & { projectId: string };
  putStep: Common & { projectId: string; stepId: string; changes: StepChanges };
  deleteStep: Common & { projectId: string; stepId: string };
  takeStep: Common & { projectId: string; stepId: string };
  releaseStep: Common & { projectId: string; stepId: string };
  // A material line is its text; `at` is the time it was written.
  putMaterial: Common & { projectId: string; lineId: string; text: string };
  deleteMaterial: Common & { projectId: string; lineId: string };
  // The lines to copy onto the shopping list, by material id. The server skips any that are already there.
  materialsToList: Common & { projectId: string; lineIds: string[] };
}

type Request = (endpoint: string, options?: RequestInit) => Promise<unknown>;

const send = (request: Request, method: string, path: string, body: object): Promise<unknown> =>
  request(path, { method, body: JSON.stringify(body) });

// A write that asked to let the other person know carries `notify: true` in its body. The server sends nothing otherwise, and ignores it
// on a write it does not announce.
function withNotify(request: Request, notify: boolean | undefined): Request {
  if (notify !== true) return request;
  return (endpoint, options) => {
    if (typeof options?.body !== 'string') return request(endpoint, options);
    return request(endpoint, { ...options, body: JSON.stringify({ ...(JSON.parse(options.body) as object), notify: true }) });
  };
}

// The caller's tasks with every earlier pending write applied, but not the write now running (it names itself by its mutation id).
type GetData = (exceptMutationId?: string) => TasksData;

const aboutOneCycle = (change: Change): boolean =>
  change.kind === 'swap' || (change.kind === 'edit' && change.set.dueOn !== undefined && change.set.repeat === undefined);

type Runner<K extends MutationKind> = (vars: MutationVars[K], request: Request, find: (taskId: string) => Task | undefined) => Promise<unknown>;

const RUNNERS: { [K in MutationKind]: Runner<K> } = {
  create: (v, request) => send(request, 'POST', '/api/hh/tasks', { ...v.task, mutationId: v.mutationId, clientAt: v.at }),

  edit: (v, request) => {
    const body: Record<string, unknown> = { mutationId: v.mutationId, clientAt: v.at };
    for (const field of ['title', 'notes', 'energy', 'checklist'] as const) {
      if (v[field] === undefined) continue;
      body[field] = v[field];
      body[`${field}At`] = v.at;
    }
    return send(request, 'PATCH', `/api/hh/tasks/${v.taskId}`, body);
  },

  tick: (v, request) => send(request, 'PATCH', `/api/hh/tasks/${v.taskId}`, {
    mutationId: v.mutationId, clientAt: v.at, ticks: { cycleSeq: v.cycleSeq, steps: { [v.stepId]: { done: v.done, at: v.at } } },
  }),

  // Base versions are read when the write runs, so earlier pending writes from this phone are already counted.
  schedule: (v, request, find) => {
    const task = find(v.taskId);
    const body: Record<string, unknown> = { mutationId: v.mutationId, clientAt: v.at, baseRuleVersion: task?.ruleVersion ?? 1 };
    if (v.assignee !== undefined) body.assignee = v.assignee;
    if (v.repeat !== undefined) body.repeat = v.repeat;
    if (v.dueOn !== undefined) body.dueOn = v.dueOn;
    if (v.dueOn !== undefined && v.repeat === undefined) body.baseCycleSeq = task?.cycleSeq ?? 1;
    return send(request, 'PATCH', `/api/hh/tasks/${v.taskId}`, body);
  },

  delete: (v, request, find) =>
    send(request, 'DELETE', `/api/hh/tasks/${v.taskId}`, { mutationId: v.mutationId, clientAt: v.at, baseRuleVersion: find(v.taskId)?.ruleVersion ?? 1 }),

  // The cycle the person was shown, not the one the overlay has moved on to.
  complete: (v, request) => send(request, 'POST', `/api/hh/tasks/${v.taskId}/complete`, { mutationId: v.mutationId, clientAt: v.at, cycleSeq: v.cycleSeq, completedAt: v.at }),

  uncomplete: (v, request) => send(request, 'DELETE', `/api/hh/tasks/${v.taskId}/completions/${v.cycleSeq}`, { mutationId: v.mutationId, clientAt: v.at }),

  restore: (v, request) => send(request, 'POST', '/api/hh/restore', { mutationId: v.mutationId, clientAt: v.at, entries: [{ kind: 'task', id: v.taskId }] }),

  propose: (v, request, find) => {
    const task = find(v.taskId);
    const body: Record<string, unknown> = {
      id: v.id, taskId: v.taskId, change: v.change, mutationId: v.mutationId, clientAt: v.at,
      // A task made a moment ago may not be in the data yet: the hint is the version it was created at.
      baseRuleVersion: task?.ruleVersion ?? v.baseRuleVersionHint,
    };
    if (aboutOneCycle(v.change)) body.baseCycleSeq = task?.cycleSeq ?? v.baseCycleSeqHint ?? 1;
    return send(request, 'POST', '/api/hh/proposals', body);
  },

  accept: (v, request) => send(request, 'POST', `/api/hh/proposals/${v.id}/accept`, { mutationId: v.mutationId, clientAt: v.at }),
  decline: (v, request) => send(request, 'POST', `/api/hh/proposals/${v.id}/decline`, { mutationId: v.mutationId, clientAt: v.at }),
  withdraw: (v, request) => send(request, 'POST', `/api/hh/proposals/${v.id}/withdraw`, { mutationId: v.mutationId, clientAt: v.at }),
};

const ITEM_RUNNERS: { [K in ItemMutationKind]: (vars: ItemMutationVars[K], request: Request) => Promise<unknown> } = {
  itemAdd: (v, request) => send(request, 'PUT', `/api/hh/items/${v.item.id}`, {
    mutationId: v.mutationId, clientAt: v.at, text: v.item.text, textAt: v.at,
    ...(v.item.quantity === undefined ? {} : { quantity: v.item.quantity, quantityAt: v.at }),
  }),
  itemEdit: (v, request) => send(request, 'PUT', `/api/hh/items/${v.itemId}`, {
    mutationId: v.mutationId, clientAt: v.at,
    ...(v.text === undefined ? {} : { text: v.text, textAt: v.at }),
    ...(v.quantity === undefined ? {} : { quantity: v.quantity, quantityAt: v.at }),
  }),
  itemTick: (v, request) => send(request, 'PUT', `/api/hh/items/${v.itemId}`, { mutationId: v.mutationId, clientAt: v.at, ticked: v.done, tickedAt: v.at }),
  itemDelete: (v, request) => send(request, 'DELETE', `/api/hh/items/${v.itemId}`, { mutationId: v.mutationId, clientAt: v.at }),
  itemClear: (v, request) => send(request, 'POST', '/api/hh/items/batch', {
    mutationId: v.mutationId, clientAt: v.at, writes: v.entries.map(entry => ({ id: entry.id, delete: true, ifTickedAt: entry.ifTickedAt })),
  }),
  itemRestore: (v, request) => send(request, 'POST', '/api/hh/restore', { mutationId: v.mutationId, clientAt: v.at, entries: v.itemIds.map(id => ({ kind: 'item', id })) }),
  itemsFromPlan: (v, request) => send(request, 'POST', '/api/hh/plan/add-to-list', { mutationId: v.mutationId, clientAt: v.at, days: v.days, lines: v.lines }),
};

const RECIPE_FIELDS = ['title', 'mealType', 'servings', 'minutes', 'lowEnergy', 'nutrition', 'ingredients', 'steps'] as const;

// Each field that is set goes with its own time. `minutes: null` and an empty `nutrition` are sent, because they clear their fields.
function recipeBody(fields: RecipeChanges & { title?: string }, mutationId: string, at: number): Record<string, unknown> {
  const body: Record<string, unknown> = { mutationId, clientAt: at };
  for (const field of RECIPE_FIELDS) {
    if (fields[field] === undefined) continue;
    body[field] = fields[field];
    body[`${field}At`] = at;
  }
  return body;
}

const MEAL_RUNNERS: { [K in MealMutationKind]: (vars: MealMutationVars[K], request: Request) => Promise<unknown> } = {
  recipeAdd: (v, request) => send(request, 'PUT', `/api/hh/recipes/${v.recipe.id}`, recipeBody(v.recipe, v.mutationId, v.at)),
  recipeEdit: (v, request) => send(request, 'PUT', `/api/hh/recipes/${v.recipeId}`, recipeBody(v.changes, v.mutationId, v.at)),
  recipeDelete: (v, request) => send(request, 'DELETE', `/api/hh/recipes/${v.recipeId}`, { mutationId: v.mutationId, clientAt: v.at }),
  recipeRestore: (v, request) => send(request, 'POST', '/api/hh/restore', { mutationId: v.mutationId, clientAt: v.at, entries: v.recipeIds.map(id => ({ kind: 'recipe', id })) }),
  planSet: (v, request) => send(request, 'PUT', `/api/hh/plan/${v.day}`, { mutationId: v.mutationId, clientAt: v.at, meal: v.meal, mealAt: v.at }),
};

const moneyPath = (id: string): string => `/api/hh/money/${id}`;

const MONEY_RUNNERS: { [K in MoneyMutationKind]: (vars: MoneyMutationVars[K], request: Request) => Promise<unknown> } = {
  moneyAdd: (v, request) => {
    const { id, description, on, ...unit } = v.entry;
    return send(request, 'PUT', moneyPath(id), { ...unit, description, descriptionAt: v.at, on, onAt: v.at, mutationId: v.mutationId, clientAt: v.at });
  },
  moneyEdit: (v, request) => send(request, 'PUT', moneyPath(v.entryId), {
    mutationId: v.mutationId, clientAt: v.at,
    ...(v.money === undefined ? {} : { ...v.money, baseVersion: v.baseVersion }),
    ...(v.description === undefined ? {} : { description: v.description, descriptionAt: v.at }),
    ...(v.on === undefined ? {} : { on: v.on, onAt: v.at }),
  }),
  moneyRespond: (v, request) => send(request, 'POST', `${moneyPath(v.entryId)}/respond`, { mutationId: v.mutationId, clientAt: v.at, response: v.response, version: v.version }),
  moneyChange: (v, request) => send(request, 'POST', `${moneyPath(v.entryId)}/change`, {
    mutationId: v.mutationId, clientAt: v.at, version: v.version, ...(v.money === undefined ? {} : { money: v.money }), ...(v.delete === undefined ? {} : { delete: true }),
  }),
  moneyChangeRespond: (v, request) =>
    send(request, 'POST', `${moneyPath(v.entryId)}/change/respond`, { mutationId: v.mutationId, clientAt: v.at, response: v.response, requestId: v.requestId }),
  moneyChangeWithdraw: (v, request) => send(request, 'POST', `${moneyPath(v.entryId)}/change/withdraw`, { mutationId: v.mutationId, clientAt: v.at, requestId: v.requestId }),
  moneyDelete: (v, request) => send(request, 'DELETE', moneyPath(v.entryId), { mutationId: v.mutationId, clientAt: v.at }),
  moneyRestore: (v, request) => send(request, 'POST', '/api/hh/restore', {
    mutationId: v.mutationId, clientAt: v.at, entries: v.entries.map(entry => ({ kind: 'money', id: entry.id, deletedAt: entry.deletedAt })),
  }),
};

const calendarPath = (id: string): string => `/api/hh/calendar/${id}`;

function scheduleBody(schedule: Schedule, at: number): Record<string, unknown> {
  return { ...schedule, scheduleAt: at };
}

function peopleBody(people: People, at: number): Record<string, unknown> {
  return { who: people.who, private: people.private, peopleAt: at };
}

const CALENDAR_RUNNERS: { [K in CalendarMutationKind]: (vars: CalendarMutationVars[K], request: Request) => Promise<unknown> } = {
  createEvent: (v, request) => {
    const { id, kind, title, place, notes, schedule, people } = v.event;
    return send(request, 'PUT', calendarPath(id), {
      mutationId: v.mutationId, clientAt: v.at, kind, title, titleAt: v.at,
      ...(place === undefined ? {} : { place, placeAt: v.at }),
      ...(notes === undefined ? {} : { notes, notesAt: v.at }),
      ...scheduleBody(schedule, v.at), ...peopleBody(people, v.at),
    });
  },
  editEvent: (v, request) => send(request, 'PUT', calendarPath(v.eventId), {
    mutationId: v.mutationId, clientAt: v.at,
    ...(v.title === undefined ? {} : { title: v.title, titleAt: v.at }),
    ...(v.place === undefined ? {} : { place: v.place, placeAt: v.at }),
    ...(v.notes === undefined ? {} : { notes: v.notes, notesAt: v.at }),
    ...(v.schedule === undefined ? {} : scheduleBody(v.schedule, v.at)),
    ...(v.people === undefined ? {} : peopleBody(v.people, v.at)),
  }),
  deleteEvent: (v, request) => send(request, 'DELETE', calendarPath(v.eventId), { mutationId: v.mutationId, clientAt: v.at }),
  setReminders: (v, request) => send(request, 'PUT', `${calendarPath(v.eventId)}/reminders`, { mutationId: v.mutationId, clientAt: v.at, list: v.list }),
  eventRestore: (v, request) => send(request, 'POST', '/api/hh/restore', {
    mutationId: v.mutationId, clientAt: v.at, entries: v.entries.map(entry => ({ kind: 'event', id: entry.id, deletedAt: entry.deletedAt })),
  }),
};

const projectPath = (id: string): string => `/api/hh/projects/${id}`;
const stepPath = (projectId: string, stepId: string): string => `${projectPath(projectId)}/steps/${stepId}`;
const plain = (v: Common): { mutationId: string; clientAt: number } => ({ mutationId: v.mutationId, clientAt: v.at });

// Each changed field goes with the time of the action, as the server's per-field rule expects.
function stamped(changes: object, at: number): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    // The planned day is two days under one time: `plannedOn`, `plannedEndOn` and `plannedAt`.
    if (field === 'planned') {
      const planned = value as PlannedChange;
      body.plannedOn = planned.plannedOn;
      if (planned.plannedEndOn !== undefined) body.plannedEndOn = planned.plannedEndOn;
      body.plannedAt = at;
      continue;
    }
    body[field] = value;
    // The figures are `estimatePence` and `spentPence`, each with its own time, `estimateAt` and `spentAt`.
    body[field === 'estimatePence' ? 'estimateAt' : field === 'spentPence' ? 'spentAt' : `${field}At`] = at;
  }
  return body;
}

const PROJECT_RUNNERS: { [K in ProjectMutationKind]: (vars: ProjectMutationVars[K], request: Request) => Promise<unknown> } = {
  putProject: (v, request) => send(request, 'PUT', projectPath(v.projectId), { ...plain(v), ...stamped(v.changes, v.at) }),
  deleteProject: (v, request) => send(request, 'DELETE', projectPath(v.projectId), plain(v)),
  restoreProject: (v, request) => send(request, 'POST', '/api/hh/restore', { ...plain(v), entries: v.entries.map(entry => ({ kind: 'project', ...entry })) }),
  takeProject: (v, request) => send(request, 'POST', `${projectPath(v.projectId)}/take`, plain(v)),
  releaseProject: (v, request) => send(request, 'POST', `${projectPath(v.projectId)}/release`, plain(v)),
  putStep: (v, request) => send(request, 'PUT', stepPath(v.projectId, v.stepId), { ...plain(v), ...stamped(v.changes, v.at) }),
  deleteStep: (v, request) => send(request, 'DELETE', stepPath(v.projectId, v.stepId), plain(v)),
  takeStep: (v, request) => send(request, 'POST', `${stepPath(v.projectId, v.stepId)}/take`, plain(v)),
  releaseStep: (v, request) => send(request, 'POST', `${stepPath(v.projectId, v.stepId)}/release`, plain(v)),
  putMaterial: (v, request) => send(request, 'PUT', `${projectPath(v.projectId)}/materials/${v.lineId}`, { ...plain(v), text: v.text, textAt: v.at }),
  deleteMaterial: (v, request) => send(request, 'DELETE', `${projectPath(v.projectId)}/materials/${v.lineId}`, plain(v)),
  materialsToList: (v, request) => send(request, 'POST', `${projectPath(v.projectId)}/materials/add-to-list`, { ...plain(v), lineIds: v.lineIds }),
};

// What to tell the person when a write was dropped. Only a final failure reaches here: a network failure, a lapsed sign-in or a server
// error that is still being retried says nothing (retryRules.ts); one that has used up its tries, or that the server refused, does.
// A write dropped because someone else is now signed in says nothing.
export function describeFailure(error: unknown, kind?: string, otherName?: string): string | undefined {
  if (!(error instanceof ApiError)) return undefined;
  if (error.code === 'wrong_user') return undefined;
  if (error.code === 'recipe_limit') return 'This household has reached 200 recipes.';
  if (error.code === 'project_limit') return 'This household has reached 60 projects.';
  if (error.code === 'step_limit') return 'This project has reached 40 steps.';
  const calendar = kind !== undefined && kind in calendarMutationKeys && error.code !== undefined ? calendarFailureText(error.code) : undefined;
  if (calendar) return calendar;
  // The money codes come before the generic 409 text, which says less.
  const money = kind?.startsWith('money') && error.code !== undefined ? moneyFailureText(error.code, otherName) : undefined;
  if (money) return money;
  if (error.status === 400 && (kind === 'recipeAdd' || kind === 'recipeEdit')) return "That recipe couldn't be saved. Please check its length.";
  if (error.status === 409) return 'This changed on another phone. Please check it and try again.';
  if (error.status === 410) return 'That was deleted on another phone.';
  if (error.status === 403 && error.code === 'proposal_required') return 'That change needs their say. Ask them instead.';
  if (error.status === 401) return undefined;
  if (error.status >= 500) return "We couldn't save that change. Try again.";
  return "We couldn't save that change.";
}

// A write the server said needs the other person's say, turned into the proposal it should have been. Only the changes that have a
// proposal form (a schedule change, a delete, a restore) can be asked; an edit of words never needs one.
function askInstead(client: QueryClient, kind: MutationKind, variables: MutationVars[MutationKind]): (() => void) | undefined {
  const taskId = (variables as { taskId?: string }).taskId;
  if (!taskId) return undefined;
  let change: Change | undefined;
  if (kind === 'delete') change = { kind: 'delete' };
  else if (kind === 'restore') change = { kind: 'restore' };
  else if (kind === 'schedule') {
    const { assignee, repeat, dueOn } = variables as MutationVars['schedule'];
    change = { kind: 'edit', set: { ...(assignee === undefined ? {} : { assignee }), ...(repeat === undefined ? {} : { repeat }), ...(dueOn === undefined ? {} : { dueOn }) } };
  }
  if (!change) return undefined;
  const asked = change;
  return () => {
    new MutationObserver(client, { mutationKey: mutationKeys.propose }).mutate({
      mutationId: crypto.randomUUID(), at: Date.now(), by: variables.by, id: crypto.randomUUID(), taskId, change: asked, baseRuleVersionHint: 1,
    } as never).catch(() => undefined);
  };
}

// Writes belong to the person who made them. `guard` says who that is and who is signed in now: a write that finds someone else
// signed in is dropped, never sent, so it cannot go out under another person's name.
export interface OwnerGuard {
  ownerId: string;
  currentUserId: () => string | undefined;
}

function guarded<V, R>(guard: OwnerGuard | undefined, run: (variables: V) => Promise<R>): (variables: V) => Promise<R> {
  return variables => {
    if (guard && guard.currentUserId() !== guard.ownerId) return Promise.reject(new ApiError(403, 'Forbidden', 'wrong_user'));
    return run(variables);
  };
}

// What every household mutation carries so a write survives a bad connection and a reload: online-only (it waits while offline),
// retried by the shared rules, and backed off by them.
const OFFLINE_DEFAULTS = { networkMode: 'online' as const, retry: shouldRetry, retryDelay };

interface MutationSet {
  keys: Record<string, readonly ['household', string]>;
  // Runs one kind. `variables.mutationId` names the write now running.
  run: (kind: string, variables: never, request: Request) => Promise<unknown>;
  // What to refresh when a write of this kind settles.
  invalidate: (kind: string) => QueryKey[];
  onError: (kind: string, error: unknown, variables: never) => void;
  onSuccess?: (kind: string, variables: never, data: unknown) => void;
}

// Registers every kind of one set the same way: household scope, the offline defaults, the owner guard, and a refresh of the set's own
// queries when a write settles.
function registerSet(client: QueryClient, request: Request, guard: OwnerGuard | undefined, set: MutationSet): void {
  for (const kind of Object.keys(set.keys)) {
    client.setMutationDefaults(set.keys[kind], {
      ...OFFLINE_DEFAULTS,
      scope: { id: 'household' },
      mutationFn: guarded(guard, (variables: Common) => set.run(kind, variables as never, withNotify(request, variables.notify))),
      onSuccess: (data: unknown, variables: Common) => set.onSuccess?.(kind, variables as never, data),
      onError: (error: unknown, variables: Common) => set.onError(kind, error, variables as never),
      onSettled: () => {
        noteMutationSettled();
        for (const queryKey of set.invalidate(kind)) void client.invalidateQueries({ queryKey });
      },
    });
  }
}

function memberName(client: QueryClient, userId: string | undefined): string {
  const household = client.getQueryData<HouseholdData>(HOUSEHOLD_KEY);
  return household?.members.find(member => member.userId === userId)?.displayName ?? 'Someone';
}

// The person's own words for a field whose write was older than what is stored, in words for the fields that are not text.
function keptText(field: string, changes: Record<string, unknown>): string {
  const value = changes[field];
  if (field === 'state') return value === 'done' ? 'Done' : 'Not started';
  if (field === 'planned') return plannedText(value as PlannedChange);
  if (field === 'estimate' || field === 'spent') return value === null ? 'Cleared' : formatPounds(Number(changes[field === 'estimate' ? 'estimatePence' : 'spentPence']));
  if (field === 'position') return 'A move to another place in the list';
  if (value === null) return 'Cleared';
  return String(value);
}

function saveProjectNotices(client: QueryClient, kind: ProjectMutationKind, variables: ProjectMutationVars[ProjectMutationKind], data: unknown): void {
  const answer = data as { outcome?: string; stale?: string[]; step?: { takenBy?: string }; project?: { takenBy?: string }; results?: unknown } | undefined;
  if (!answer) return;
  const { by, at } = variables;
  if (kind === 'materialsToList') {
    const results = (data as { results?: { status: string }[] }).results ?? [];
    // Say what the press did, next to the button: the lines appear on the Shopping tab, not here.
    const vars = variables as ProjectMutationVars['materialsToList'];
    const created = results.filter(result => result.status === 'created').length;
    const already = results.filter(result => result.status === 'already').length;
    const text = created > 0
      ? `Added ${created} ${created === 1 ? 'line' : 'lines'} to Shopping.${already > 0 ? ` ${already} ${already === 1 ? 'was' : 'were'} already there.` : ''}`
      : already > 0 ? 'Already on the list' : undefined;
    if (text !== undefined) addNotice(by, { kind: 'taken', projectId: vars.projectId, recordId: vars.projectId, field: 'list', text, at });
    return;
  }
  // A save that landed is remembered, so that if the other person's newer edit replaces it later, this person is told and keeps their words.
  if ((kind === 'putStep' || kind === 'putProject') && (answer.outcome === 'applied' || answer.outcome === 'created')) {
    const vars = variables as ProjectMutationVars['putProject'] | ProjectMutationVars['putStep'];
    const recordId = kind === 'putStep' ? (vars as ProjectMutationVars['putStep']).stepId : vars.projectId;
    const fields = kind === 'putStep' ? ['text', 'note'] : ['title', 'notes'];
    for (const field of fields) {
      const value = (vars.changes as Record<string, unknown>)[field];
      if (value === undefined || (answer.stale ?? []).includes(field)) continue;
      rememberSaved(by, recordId, field, value === null ? '' : String(value), at);
    }
  }
  if (kind === 'putMaterial' && answer.stale && answer.stale.length > 0) {
    const vars = variables as ProjectMutationVars['putMaterial'];
    addNotice(by, { kind: 'replaced', projectId: vars.projectId, recordId: vars.lineId, field: 'text', text: vars.text, at });
    return;
  }
  if ((kind === 'putProject' || kind === 'putStep') && answer.stale && answer.stale.length > 0) {
    const vars = variables as ProjectMutationVars['putProject'] | ProjectMutationVars['putStep'];
    const recordId = kind === 'putStep' ? (vars as ProjectMutationVars['putStep']).stepId : vars.projectId;
    for (const field of answer.stale) addNotice(by, { kind: 'replaced', projectId: vars.projectId, recordId, field, text: keptText(field, vars.changes as Record<string, unknown>), at });
    return;
  }
  if ((kind === 'takeStep' || kind === 'takeProject') && answer.outcome === 'held_by_other') {
    const vars = variables as ProjectMutationVars['takeStep'];
    const holder = (answer.step ?? answer.project)?.takenBy;
    const recordId = kind === 'takeStep' ? vars.stepId : vars.projectId;
    // It names the step, since the message may be read away from the step that was tapped.
    const detail = client.getQueryData<{ project?: { title: string }; steps?: { id: string; text: string }[] }>(projectDetailKey(vars.projectId));
    const what = kind === 'takeStep' ? detail?.steps?.find(step => step.id === vars.stepId)?.text : detail?.project?.title;
    addNotice(by, { kind: 'taken', projectId: vars.projectId, recordId, text: alreadyHas(memberName(client, holder), what), at });
  }
}

const RESTORE_REFUSALS = ['entry_changed', 'needs_two', 'pair_changed', 'money_limit'];
const EVENT_RESTORE_REFUSALS = ['entry_changed', 'event_limit'];

function otherMemberName(client: QueryClient): string | undefined {
  const household = client.getQueryData<HouseholdData>(HOUSEHOLD_KEY);
  return household?.members.find(member => member.userId !== household.me.userId)?.displayName;
}

export function registerMutations(
  client: QueryClient, request: Request, getData: GetData, report: (message: string, options?: { ask?: () => void }) => void, guard?: OwnerGuard,
): void {
  registerSet(client, request, guard, {
    keys: mutationKeys,
    run: (kind, variables: MutationVars[MutationKind], send) => {
      const data = getData(variables.mutationId);
      const run = RUNNERS[kind as MutationKind] as Runner<MutationKind>;
      return run(variables, send, taskId => data.tasks.find(task => task.id === taskId));
    },
    // The task page's history is read on its own, so it is refreshed with the list.
    invalidate: () => [TASKS_KEY, ['task-history']],
    onError: (kind, error, variables: MutationVars[MutationKind]) => {
      const message = describeFailure(error);
      if (!message) return;
      const proposalRequired = error instanceof ApiError && error.code === 'proposal_required';
      const ask = proposalRequired ? askInstead(client, kind as MutationKind, variables) : undefined;
      report(message, ask ? { ask } : undefined);
    },
  });

  registerSet(client, request, guard, {
    keys: itemMutationKeys,
    run: (kind, variables: ItemMutationVars[ItemMutationKind], send) =>
      (ITEM_RUNNERS[kind as ItemMutationKind] as (vars: ItemMutationVars[ItemMutationKind], request: Request) => Promise<unknown>)(variables, send),
    // The add also marks plan days, so the plan is refreshed too and the marker does not flicker when the overlay drops.
    invalidate: kind => (kind === 'itemsFromPlan' ? [ITEMS_KEY, PLAN_KEY] : [ITEMS_KEY]),
    onError: (_kind, error) => {
      const message = describeFailure(error);
      if (message) report(message);
    },
  });

  registerSet(client, request, guard, {
    keys: mealMutationKeys,
    run: (kind, variables: MealMutationVars[MealMutationKind], send) =>
      (MEAL_RUNNERS[kind as MealMutationKind] as (vars: MealMutationVars[MealMutationKind], request: Request) => Promise<unknown>)(variables, send),
    invalidate: kind => (kind === 'planSet' ? [PLAN_KEY] : [RECIPES_KEY]),
    // Registered here, not in a component, so they still run after a reload replays a saved write.
    onSuccess: (kind, variables: MealMutationVars[MealMutationKind]) => {
      if (kind === 'recipeAdd') {
        const { recipe, by } = variables as MealMutationVars['recipeAdd'];
        removeDraft(by, NEW_DRAFT);
        removeDraft(by, recipe.id);
      } else if (kind === 'recipeEdit') {
        const { recipeId, by } = variables as MealMutationVars['recipeEdit'];
        removeDraft(by, recipeId);
      }
    },
    onError: (kind, error, variables: MealMutationVars[MealMutationKind]) => {
      const message = describeFailure(error, kind);
      if (!message) return;
      report(message);
      const refused = error instanceof ApiError && (error.status === 400 || error.status === 409 || error.status === 410);
      if (!refused) return;
      if (kind === 'recipeAdd') markRefused(variables.by, (variables as MealMutationVars['recipeAdd']).recipe.id, message);
      else if (kind === 'recipeEdit') markRefused(variables.by, (variables as MealMutationVars['recipeEdit']).recipeId, message);
    },
  });

  registerSet(client, request, guard, {
    keys: moneyMutationKeys,
    run: (kind, variables: MoneyMutationVars[MoneyMutationKind], send) =>
      (MONEY_RUNNERS[kind as MoneyMutationKind] as (vars: MoneyMutationVars[MoneyMutationKind], request: Request) => Promise<unknown>)(variables, send),
    invalidate: () => [MONEY_KEY],
    // A restore is answered with a status for each entry rather than an error, so the refusals are read from the answer.
    onSuccess: (kind, _variables, data) => {
      if (kind !== 'moneyRestore') return;
      const results = (data as { results?: { status: string }[] } | undefined)?.results ?? [];
      const refused = results.find(result => RESTORE_REFUSALS.includes(result.status));
      if (!refused) return;
      const message = describeFailure(new ApiError(409, 'Conflict', refused.status), kind, otherMemberName(client));
      if (message) report(message);
    },
    onError: (kind, error) => {
      const message = describeFailure(error, kind, otherMemberName(client));
      if (message) report(message);
    },
  });

  registerSet(client, request, guard, {
    keys: projectMutationKeys,
    run: (kind, variables: ProjectMutationVars[ProjectMutationKind], send) =>
      (PROJECT_RUNNERS[kind as ProjectMutationKind] as (vars: ProjectMutationVars[ProjectMutationKind], request: Request) => Promise<unknown>)(variables, send),
    // The add also changes the shopping list, so it is refreshed too.
    invalidate: kind => (kind === 'materialsToList' ? [PROJECTS_KEY, PROJECT_KEY_PREFIX, ITEMS_KEY] : [PROJECTS_KEY, PROJECT_KEY_PREFIX]),
    // Registered here, not in a component, so they still run after a reload replays a saved write. A replaced edit and a refused take are
    // answered with a 200 and an outcome, so the notices are made from the answer.
    onSuccess: (kind, variables: ProjectMutationVars[ProjectMutationKind], data) => {
      saveProjectNotices(client, kind as ProjectMutationKind, variables, data);
      // A restore is answered with a status for each project rather than an error.
      if (kind !== 'restoreProject') return;
      const results = (data as { results?: { status: string }[] } | undefined)?.results ?? [];
      if (results.some(result => result.status === 'project_limit')) report('This household has reached 60 projects.');
    },
    onError: (kind, error) => {
      const message = describeFailure(error, kind);
      if (message) report(message);
    },
  });

  registerSet(client, request, guard, {
    keys: calendarMutationKeys,
    run: (kind, variables: CalendarMutationVars[CalendarMutationKind], send) =>
      (CALENDAR_RUNNERS[kind as CalendarMutationKind] as (vars: CalendarMutationVars[CalendarMutationKind], request: Request) => Promise<unknown>)(variables, send),
    invalidate: () => [CALENDAR_KEY],
    // A restore is answered with a status for each event rather than an error, so the refusals are read from the answer.
    onSuccess: (kind, _variables, data) => {
      if (kind !== 'eventRestore') return;
      const results = (data as { results?: { status: string }[] } | undefined)?.results ?? [];
      const refused = results.find(result => EVENT_RESTORE_REFUSALS.includes(result.status));
      if (!refused) return;
      const message = calendarFailureText(refused.status);
      if (message) report(message);
    },
    onError: (kind, error) => {
      const message = describeFailure(error, kind);
      if (message) report(message);
    },
  });
}

// The one way a component runs a household mutation: by key. Its function is the registered default.
export function useHouseholdMutation<K extends MutationKind>(kind: K) {
  return useMutation<unknown, Error, MutationVars[K]>({ mutationKey: mutationKeys[kind] });
}

export function useItemMutation<K extends ItemMutationKind>(kind: K) {
  return useMutation<unknown, Error, ItemMutationVars[K]>({ mutationKey: itemMutationKeys[kind] });
}

export function useProjectMutation<K extends ProjectMutationKind>(kind: K) {
  return useMutation<unknown, Error, ProjectMutationVars[K]>({ mutationKey: projectMutationKeys[kind] });
}

export function useMealMutation<K extends MealMutationKind>(kind: K) {
  return useMutation<unknown, Error, MealMutationVars[K]>({ mutationKey: mealMutationKeys[kind] });
}

export function useCalendarMutation<K extends CalendarMutationKind>(kind: K) {
  return useMutation<unknown, Error, CalendarMutationVars[K]>({ mutationKey: calendarMutationKeys[kind] });
}

export function useMoneyMutation<K extends MoneyMutationKind>(kind: K) {
  return useMutation<unknown, Error, MoneyMutationVars[K]>({ mutationKey: moneyMutationKeys[kind] });
}

export type PlannedMutation =
  | { kind: 'create'; task: NewTask }
  | { kind: 'propose'; id: string; taskId: string; change: Change; baseRuleVersionHint: number };

// A task for the other person (or for both of you) is made as an either task first, then handed over by an edit proposal they can
// accept. They are two queued mutations, so the task shows at once and the ask follows.
export function planCreate(task: NewTask, caller: Caller): PlannedMutation[] {
  if (!needsProposal('create', { assignee: 'either' }, caller, { assignee: task.assignee })) return [{ kind: 'create', task }];
  return [
    { kind: 'create', task: { ...task, assignee: 'either' } },
    { kind: 'propose', id: crypto.randomUUID(), taskId: task.id, change: { kind: 'edit', set: { assignee: task.assignee } }, baseRuleVersionHint: 1 },
  ];
}
