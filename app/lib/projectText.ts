// Every word the Projects screens show, in one place so the wording test can read it. Neutral and low-shame: no overdue, behind, stuck,
// failed, conflict, and no word that says a person did something wrong.
import type { Step } from '../../src/projects/types';
import { holderOf } from '../../src/shared/projectRules';
import type { MemberSummary } from './household';

export const COPY = {
  notStarted: 'Not started',
  onIt: 'On it',
  done: 'Done',
  takeIt: "I'm on this",
  freeIt: 'Free this step',
  freeProject: 'Free this project',
  notSaved: 'Not saved yet',
  notSavedForOffline: 'Not saved for offline yet',
  addStep: 'Add a step',
  addStepHint: 'One step for each line. Rough notes are fine.',
  newProject: 'New project',
  empty: 'No projects yet. Add one when you start a bigger job.',
  noSteps: 'No steps yet. Add the first one below.',
  limitProjects: 'This household has reached 60 projects.',
  limitSteps: 'This project has reached 40 steps.',
  noRoom: "This step can't be moved there. Move another step instead.",
  replaced: 'This was changed after you wrote it. Your wording is kept here.',
  finish: 'Mark as finished',
  finished: 'Finished',
  bringBack: 'Bring back',
  copy: 'Copy',
  dismiss: 'Dismiss',
  undo: 'Undo',
  moveUp: 'Move up',
  moveDown: 'Move down',
  deletedProject: 'This project was deleted. You can bring it back from Deleted.',
  gone: 'That was deleted.',
  materials: 'Materials',
  addMaterials: 'Add materials',
  addMaterialsHint: 'One line for each item, like 6 lengths of 47x100 timber, 2.4m.',
  addToList: 'Add to the shopping list',
  onTheList: 'On the list',
  alreadyOnList: 'Already on the list',
  clearedFromList: 'Added earlier, and since cleared',
  limitMaterials: 'This project has reached 60 materials.',
} as const;

export const heldBy = (name: string): string => `${name} is on this`;
export const youHold = "You're on this";
export const alreadyHas = (name: string): string => `${name} already has this`;
export const lastChangedBy = (name: string): string => `Last changed by ${name}`;
export const stepsDone = (done: number, steps: number): string => `${done} of ${steps} ${steps === 1 ? 'step' : 'steps'} done`;
export const stepsAndMore = (steps: number): string => `${steps} ${steps === 1 ? 'step' : 'steps'}`;

const DAY_MS = 86_400_000;

// A neutral age for a hold: "On it for 3 weeks". Nothing is said for under a day, and it is never worded as stale.
export function onItFor(takenAt: number | undefined, now: number): string | undefined {
  if (takenAt === undefined) return undefined;
  const days = Math.floor((now - takenAt) / DAY_MS);
  if (days < 1) return undefined;
  if (days < 14) return `On it for ${days} ${days === 1 ? 'day' : 'days'}`;
  return `On it for ${Math.floor(days / 7)} weeks`;
}

export const nameOf = (members: MemberSummary[], userId: string | undefined): string | undefined => members.find(member => member.userId === userId)?.displayName;

export type StepStatus = 'notStarted' | 'onIt' | 'done';

// A step is Done, On it (todo with a holder who is a current member), or Not started.
export function stepStatus(step: Pick<Step, 'state' | 'takenBy'>, members: MemberSummary[]): StepStatus {
  if (step.state === 'done') return 'done';
  return holderOf(step, members) === undefined ? 'notStarted' : 'onIt';
}

export const STATUS_WORDS: Record<StepStatus, string> = { notStarted: COPY.notStarted, onIt: COPY.onIt, done: COPY.done };

// Who is on a step or project, in words, or undefined when nobody is. A holder who has left reads as nobody.
export function holderLine(record: { takenBy?: string }, members: MemberSummary[], me: string): string | undefined {
  const holder = holderOf(record, members);
  if (holder === undefined) return undefined;
  return holder === me ? youHold : heldBy(nameOf(members, holder) ?? 'Someone');
}
