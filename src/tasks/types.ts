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
