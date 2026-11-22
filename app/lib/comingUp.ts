// What Today's "Coming up" shows: the next few calendar items on the days after today, and one quiet line for a project that needs
// noticing (a step the other person has taken, or a planned day within a week). Short on purpose: three lines at most of each.
import { addDays } from '../../src/shared/schedule';
import { buildTimeline } from '../../src/shared/timeline';
import type { TimelineInputs, TimelineItem } from '../../src/shared/timeline';
import { holderOf } from '../../src/shared/projectRules';
import type { ListedProject } from './projects';
import type { MemberSummary } from './household';
import { dayHeading } from './planText';
import { plannedText } from './projectText';

export const COMING_DAYS = 3;
export const COMING_LIMIT = 3;
export const PROJECT_LINES = 3;
const PROJECT_DAYS = 7;

export interface ComingItem {
  key: string;
  day: string;
  // The day as a person reads it: "Tue 24 Nov".
  dayText: string;
  time?: string;
  label: string;
  who: string;
}

// Calendar things only: events, routines and imported items (and "Busy" for the other person's private ones). Tasks, the dinner and
// projects have their own places.
const COMING_TYPES: TimelineItem['type'][] = ['event', 'block', 'busy', 'imported'];

export function comingUp(inputsFor: (day: string) => TimelineInputs, today: string, viewer: string): ComingItem[] {
  const items: ComingItem[] = [];
  for (let offset = 1; offset <= COMING_DAYS && items.length < COMING_LIMIT; offset += 1) {
    const day = addDays(today, offset);
    const timeline = buildTimeline(day, inputsFor(day), viewer);
    for (const item of [...timeline.allDay, ...timeline.timed]) {
      if (!COMING_TYPES.includes(item.type)) continue;
      items.push({ key: `${day}#${item.key}`, day, dayText: dayHeading(day), ...(item.startTime === undefined ? {} : { time: item.startTime }), label: item.label, who: item.who });
    }
  }
  return items.slice(0, COMING_LIMIT);
}

export interface ProjectLine {
  id: string;
  text: string;
}

// One line for a project at most: the other person has taken some of its steps, or it is planned for a day within a week. Active
// projects only, and a departed person's steps do not count.
export function projectLines(projects: ListedProject[], today: string, me: string, members: MemberSummary[]): ProjectLine[] {
  const lines: ProjectLine[] = [];
  const other = members.find(member => member.userId !== me);
  for (const project of projects) {
    if (project.status !== 'active' || project.deletedAt !== undefined) continue;
    const held = other === undefined ? 0 : project.counts?.held[other.userId] ?? 0;
    const planned = project.plannedOn !== undefined && project.plannedOn >= today && project.plannedOn <= addDays(today, PROJECT_DAYS);
    if (held > 0 && other !== undefined) {
      lines.push({ id: project.id, text: `${other.displayName} has ${held} ${held === 1 ? 'step' : 'steps'} in ${project.title}` });
    } else if (planned && project.plannedOn !== undefined) {
      lines.push({ id: project.id, text: `${project.title}: ${plannedText({ plannedOn: project.plannedOn, plannedEndOn: project.plannedEndOn }).replace(/^Planned/, 'planned')}` });
    } else if (holderOf(project, members) === other?.userId && other !== undefined) {
      lines.push({ id: project.id, text: `${other.displayName} has the project ${project.title}` });
    }
  }
  return lines.slice(0, PROJECT_LINES);
}
