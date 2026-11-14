import { hhPk } from '../household/keys';
import type { Key } from '../store';

export const TASK_PREFIX = 'TASK#';
export const DONE_PREFIX = 'DONE#';
export const EDIT_PREFIX = 'EDIT#';
export const PROPOSAL_PREFIX = 'PROPOSAL#';
export const ITEM_PREFIX = 'ITEM#';

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

export const taskKey = (householdId: string, taskId: string): Key => ({ PK: hhPk(householdId), SK: `${TASK_PREFIX}${taskId}` });
// Zero-padded to 8 digits, so a task's completions sort in cycle order.
export const doneSk = (taskId: string, cycleSeq: number): string => `${DONE_PREFIX}${taskId}#${pad(cycleSeq, 8)}`;
export const doneKey = (householdId: string, taskId: string, cycleSeq: number): Key => ({ PK: hhPk(householdId), SK: doneSk(taskId, cycleSeq) });
export const doneTaskPrefix = (taskId: string): string => `${DONE_PREFIX}${taskId}#`;
export const editKey = (householdId: string, taskId: string, at: number): Key => ({ PK: hhPk(householdId), SK: `${EDIT_PREFIX}${taskId}#${pad(at, 15)}` });
export const editTaskPrefix = (taskId: string): string => `${EDIT_PREFIX}${taskId}#`;
export const proposalKey = (householdId: string, proposalId: string): Key => ({ PK: hhPk(householdId), SK: `${PROPOSAL_PREFIX}${proposalId}` });
export const mutKey = (householdId: string, mutationId: string): Key => ({ PK: hhPk(householdId), SK: `MUT#${mutationId}` });

export const itemKey = (householdId: string, itemId: string): Key => ({ PK: hhPk(householdId), SK: `${ITEM_PREFIX}${itemId}` });
