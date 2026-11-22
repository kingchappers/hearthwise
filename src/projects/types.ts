import type { Energy } from '../shared/energy';
export type ProjectStatus = 'active' | 'finished';
export type StepState = 'todo' | 'done';
export type ProjectOutcome = 'created' | 'applied' | 'noop' | 'gone';

// The client time each field was last set. A field that was never set has none.
export interface ProjectFieldTimes {
  title?: number;
  notes?: number;
  status?: number;
  planned?: number;
  ordered?: number;
  estimate?: number;
  spent?: number;
}

export interface StepFieldTimes {
  text?: number;
  note?: number;
  energy?: number;
  state?: number;
  position?: number;
}

interface Tombstone {
  deletedAt?: number;
  deletedBy?: string;
  // Epoch seconds. A live record has none.
  expiresAt?: number;
}

export interface Project extends Tombstone {
  id: string;
  title: string;
  notes?: string;
  status: ProjectStatus;
  // The steps are meant to be done in order: the app marks the next one. It blocks nothing. Stored only when true.
  ordered?: true;
  plannedOn?: string;
  plannedEndOn?: string;
  estimatePence?: number;
  spentPence?: number;
  costBy?: string;
  takenBy?: string;
  takenAt?: number;
  fieldTimes: ProjectFieldTimes;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
}

export interface Step extends Tombstone {
  id: string;
  projectId: string;
  text: string;
  note?: string;
  energy?: Energy;
  state: StepState;
  position: string;
  takenBy?: string;
  takenAt?: number;
  doneBy?: string;
  doneAt?: number;
  fieldTimes: StepFieldTimes;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
}

// A field of a write: the value and the client time it was set. `null` clears an optional field.
export interface Stamped<T> {
  value: T;
  at: number;
}

// The planned day: the start and an optional end, written together under one time. `plannedOn: null` clears both.
export interface PlannedValue {
  plannedOn: string | null;
  plannedEndOn?: string | null;
}

export interface ProjectWrite {
  title?: Stamped<string>;
  notes?: Stamped<string | null>;
  status?: Stamped<ProjectStatus>;
  ordered?: Stamped<boolean>;
  planned?: Stamped<PlannedValue>;
  // Whole pence, 1 or more, or `null` to clear. Each figure has its own time.
  estimate?: Stamped<number | null>;
  spent?: Stamped<number | null>;
}

export interface StepWrite {
  text?: Stamped<string>;
  note?: Stamped<string | null>;
  energy?: Stamped<Energy | null>;
  state?: Stamped<StepState>;
  position?: Stamped<string>;
}

export interface Material extends Tombstone {
  id: string;
  projectId: string;
  text: string;
  fieldTimes: { text?: number };
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
}

export interface MaterialWrite {
  text?: Stamped<string>;
}

export interface ProjectsData {
  projects: Project[];
  deleted: Project[];
  serverTime: number;
}
