export interface DeliverySettings {
  // Hours are 0 to 23 in the device's own time zone.
  hour: number;
  quietStart: number | null;
  quietEnd: number | null;
  timeZone: string;
}

export interface LocalMoment {
  date: string;
  hour: number;
}

// The date and hour it is right now in a person's own time zone.
export function localMoment(now: Date, timeZone: string): LocalMoment {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string): string => parts.find(item => item.type === type)?.value ?? '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) };
}

// Quiet hours may run past midnight (22 to 7). The same start and end means none.
export function isQuietHour(hour: number, quietStart: number | null, quietEnd: number | null): boolean {
  if (quietStart === null || quietEnd === null || quietStart === quietEnd) return false;
  return quietStart < quietEnd ? hour >= quietStart && hour < quietEnd : hour >= quietStart || hour < quietEnd;
}

// A reminder chosen for a quiet hour waits until the quiet hours end.
export function sendHour({ hour, quietStart, quietEnd }: DeliverySettings): number {
  return isQuietHour(hour, quietStart, quietEnd) && quietEnd !== null ? quietEnd : hour;
}

// ---- What to send a member, from their settings and the tasks ----

import { effectiveAssignee, type Roster } from '../tasks/ownership';
import type { MemberSettings } from '../shared/household';
import type { Task } from '../tasks/types';

export interface Recipient {
  userId: string;
  settings: MemberSettings;
}

export interface PushMessage {
  title: string;
  body: string;
  tag: string;
  url: string;
}

// The chosen hour and up to two after, never past local midnight: a late hour is not sent again the next day.
export function inWindow(chosenHour: number, localHour: number): boolean {
  return localHour >= chosenHour && localHour <= Math.min(chosenHour + 2, 23);
}

const isOpen = (task: Task): boolean => task.status === 'open' && task.deletedAt === undefined;
const isTheirs = (task: Task, member: Recipient, roster: Roster): boolean => {
  const who = effectiveAssignee(task, roster);
  return who === member.userId || who === 'either' || who === 'both';
};

const MAX_LISTED = 3;
function listTitles(tasks: Task[]): string {
  const titles = tasks.slice(0, MAX_LISTED).map(task => task.title);
  const more = tasks.length - titles.length;
  return more > 0 ? `${titles.join(', ')} and ${more} more` : titles.join(', ');
}

// Open tasks that are theirs and due today or on an earlier day, in one push. Nothing to list means nothing to send.
export function digestFor(member: Recipient, tasks: Task[], roster: Roster, moment: LocalMoment): PushMessage | undefined {
  if (!member.settings.digest.on || !inWindow(member.settings.digest.hour, moment.hour)) return undefined;
  const due = tasks.filter(task => isOpen(task) && task.dueOn !== undefined && task.dueOn <= moment.date && isTheirs(task, member, roster));
  if (due.length === 0) return undefined;
  const title = due.length === 1 ? '1 thing due' : `${due.length} things due`;
  return { title, body: listTitles(due), tag: `digest-${moment.date}`, url: '/' };
}

// One push for each task of theirs that is due today.
export function nudgesFor(member: Recipient, tasks: Task[], roster: Roster, moment: LocalMoment): PushMessage[] {
  if (!member.settings.dueNudges.on || !inWindow(member.settings.dueNudges.hour, moment.hour)) return [];
  return tasks
    .filter(task => isOpen(task) && task.dueOn === moment.date && isTheirs(task, member, roster))
    .map(task => ({ title: 'Due today', body: task.title, tag: `nudge-${task.id}-${moment.date}`, url: `/tasks/${task.id}` }));
}
