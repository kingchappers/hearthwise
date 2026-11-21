// Every word the Projects screens show, in one place so the wording test can read it. Neutral and low-shame: no overdue, behind, stuck,
// failed, conflict, and no word that says a person did something wrong.
import type { Step } from '../../src/projects/types';
import { holderOf } from '../../src/shared/projectRules';
import { formatPounds } from '../../src/shared/money';
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
  addCost: 'Add a cost',
  costs: 'Costs',
  estimate: 'Estimate',
  spentSoFar: 'Spent so far',
  notInMoney: 'Not in Money. This is only for the project.',
  saveCosts: 'Save costs',
  plannedFor: 'Planned for',
  plannedStart: 'Planned for (day)',
  plannedEnd: 'Last day (optional)',
  clearPlanned: 'Clear the planned day',
  plannedEndError: 'The last day must be on or after the first, and within 14 days.',
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

const dayName = (day: string): string => new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));
const dayMonth = (day: string): string => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

// "Planned for Saturday 5 December", or "Planned for 5 to 6 December". It is not a deadline: a day that has passed reads the same way.
export function plannedText(planned: { plannedOn: string | null; plannedEndOn?: string | null }): string {
  if (planned.plannedOn === null) return 'No day planned';
  if (planned.plannedEndOn === undefined || planned.plannedEndOn === null || planned.plannedEndOn === planned.plannedOn) return `Planned for ${dayName(planned.plannedOn)}`;
  const [startDay, startMonth] = dayMonth(planned.plannedOn).split(' ');
  const [endDay, endMonth] = dayMonth(planned.plannedEndOn).split(' ');
  return startMonth === endMonth ? `Planned for ${startDay} to ${endDay} ${endMonth}` : `Planned for ${startDay} ${startMonth} to ${endDay} ${endMonth}`;
}

// "£1,250.00 of £4,000.00", "Estimated £4,000.00" or "£1,250.00 spent so far", from whichever figures are set. Never a verdict: nothing says
// over, under or on budget.
export function costLine(project: { estimatePence?: number; spentPence?: number }): string | undefined {
  const { estimatePence, spentPence } = project;
  if (estimatePence !== undefined && spentPence !== undefined) return `${formatPounds(spentPence)} of ${formatPounds(estimatePence)}`;
  if (estimatePence !== undefined) return `Estimated ${formatPounds(estimatePence)}`;
  if (spentPence !== undefined) return `${formatPounds(spentPence)} spent so far`;
  return undefined;
}
