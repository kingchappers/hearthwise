export type ProjectStatus = 'active' | 'finished';
export type StepState = 'todo' | 'done';
export type ProjectOutcome = 'created' | 'applied' | 'noop' | 'gone';

// The client time each field was last set. A field that was never set has none.
export interface ProjectFieldTimes {
  title?: number;
  notes?: number;
  status?: number;
  planned?: number;
  estimate?: number;
  spent?: number;
}

export interface StepFieldTimes {
  text?: number;
  note?: number;
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

export interface ProjectWrite {
  title?: Stamped<string>;
  notes?: Stamped<string | null>;
  status?: Stamped<ProjectStatus>;
}

export interface StepWrite {
  text?: Stamped<string>;
  note?: Stamped<string | null>;
  state?: Stamped<StepState>;
  position?: Stamped<string>;
}

export interface ProjectsData {
  projects: Project[];
  deleted: Project[];
  serverTime: number;
}
