import type { Item } from '../store';
import { TASK_PREFIX } from './keys';
import type { ChecklistStep, Task } from './types';
import type { Repeat } from '../shared/schedule';

export const FIVE_MINUTES_MS = 5 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

// A client time more than 5 minutes ahead of the server is set to the server's time.
export const clampTime = (at: number, nowMs: number): number => (at > nowMs + FIVE_MINUTES_MS ? nowMs : at);

// The item as the API returns it. Nested values are copied, so a caller cannot change what a store holds.
export function toTask(item: Item): Task {
  const task: Task = {
    id: item.SK.slice(TASK_PREFIX.length),
    title: String(item.title),
    fieldTimes: structuredClone((item.fieldTimes as Task['fieldTimes'] | undefined) ?? {}),
    assignee: String(item.assignee),
    repeat: structuredClone(item.repeat as Repeat),
    cycleSeq: Number(item.cycleSeq),
    ruleVersion: Number(item.ruleVersion),
    checklist: structuredClone((item.checklist as ChecklistStep[] | undefined) ?? []),
    checklistState: structuredClone((item.checklistState as Task['checklistState'] | undefined) ?? {}),
    status: item.status === 'done' ? 'done' : 'open',
    createdBy: String(item.createdBy),
    updatedAt: Number(item.updatedAt),
  };
  if (typeof item.notes === 'string') task.notes = item.notes;
  if (typeof item.overrideAssignee === 'string') task.overrideAssignee = item.overrideAssignee;
  if (typeof item.overrideCycle === 'number') task.overrideCycle = item.overrideCycle;
  if (typeof item.dueOn === 'string') task.dueOn = item.dueOn;
  if (typeof item.doneAt === 'number') task.doneAt = item.doneAt;
  if (typeof item.deletedAt === 'number') task.deletedAt = item.deletedAt;
  if (typeof item.deletedBy === 'string') task.deletedBy = item.deletedBy;
  if (typeof item.expiresAt === 'number') task.expiresAt = item.expiresAt;
  return task;
}

// What an update would leave behind, for answering without another read.
export function applyChange(item: Item, set: Record<string, unknown>, remove: string[] = []): Item {
  const next: Item = { ...item };
  for (const [name, value] of Object.entries(set)) {
    if (value !== undefined) next[name] = value;
  }
  for (const name of remove) delete next[name];
  return next;
}

const forward = (item: Item, nowMs: number): number => Math.max(nowMs, Number(item.updatedAt) + 1);

// What turns a task into a tombstone, and what brings it back. Shared by delete, restore and the proposals that do either.
export function tombstoneChange(item: Item, userId: string, nowMs: number): { set: Record<string, unknown>; remove: string[] } {
  return {
    set: {
      deletedAt: nowMs,
      deletedBy: userId,
      expiresAt: Math.floor(nowMs / 1000) + THIRTY_DAYS_SECONDS,
      ruleVersion: Number(item.ruleVersion) + 1,
      updatedAt: forward(item, nowMs),
    },
    remove: [],
  };
}

export function restoreChange(item: Item, nowMs: number): { set: Record<string, unknown>; remove: string[] } {
  const set: Record<string, unknown> = { ruleVersion: Number(item.ruleVersion) + 1, updatedAt: forward(item, nowMs) };
  const remove = ['deletedAt', 'deletedBy'];
  // A restored done to-do gets its 30-day expiry back, counted from when it was done; anything else has no expiry.
  if (item.status === 'done' && typeof item.doneAt === 'number') set.expiresAt = Math.floor(item.doneAt / 1000) + THIRTY_DAYS_SECONDS;
  else remove.push('expiresAt');
  return { set, remove };
}
