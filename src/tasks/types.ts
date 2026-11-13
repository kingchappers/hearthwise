import type { Repeat } from '../shared/schedule';

export interface ChecklistStep {
  id: string;
  text: string;
}

export interface TickInput {
  cycleSeq: number;
  steps: Record<string, { done: boolean; at: number }>;
}

// What the API accepts. Wire shapes are flat; these are the parsed forms the domain modules take.
export interface CreateTaskInput {
  id: string;
  title: string;
  notes?: string;
  assignee: string;
  repeat: Repeat;
  dueOn?: string;
  checklist?: ChecklistStep[];
  mutationId: string;
  clientAt?: number;
  notify?: boolean;
}

export interface PatchTaskInput {
  title?: { value: string; at: number };
  notes?: { value: string; at: number };
  checklist?: { value: ChecklistStep[]; at: number };
  ticks?: TickInput;
  assignee?: { value: string; baseRuleVersion: number };
  // `dueOn` is the client's suggested date for the new rule (not required for `none`).
  repeat?: { value: Repeat; dueOn?: string; baseRuleVersion: number };
  dueOn?: { value: string; baseRuleVersion: number; baseCycleSeq: number };
  mutationId: string;
  clientAt?: number;
  notify?: boolean;
}

export type Change =
  | { kind: 'edit'; set: { assignee?: string; dueOn?: string; repeat?: Repeat } }
  | { kind: 'swap' }
  | { kind: 'delete' }
  | { kind: 'restore' };

export interface ProposalInput {
  id: string;
  taskId: string;
  change: Change;
  baseRuleVersion: number;
  baseCycleSeq?: number;
  mutationId: string;
  clientAt?: number;
  notify?: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  // The client time each of title, notes and checklist was last set (ms), so an older edit never overwrites a newer one.
  fieldTimes: { title?: number; notes?: number; checklist?: number };
  // A member's user id, 'either' or 'both'.
  assignee: string;
  overrideAssignee?: string;
  overrideCycle?: number;
  repeat: Repeat;
  dueOn?: string;
  cycleSeq: number;
  ruleVersion: number;
  checklist: ChecklistStep[];
  checklistState: Record<string, { done: boolean; at: number }>;
  status: 'open' | 'done';
  doneAt?: number;
  createdBy: string;
  updatedAt: number;
  deletedAt?: number;
  deletedBy?: string;
  // Epoch seconds, when the store may purge it.
  expiresAt?: number;
}

// A refusal the API turns into { error: code, ...extra } with the status.
export class TaskError extends Error {
  constructor(readonly code: string, readonly status: number, readonly extra: Record<string, unknown> = {}) {
    super(code);
    this.name = 'TaskError';
  }
}
