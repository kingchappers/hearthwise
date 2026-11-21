import type { EventOrBusy, FeedView, ImportedView } from '../calendar/types';
import type { Project } from '../projects/types';
import { effectiveAssignee } from '../tasks/ownership';
import type { Task } from '../tasks/types';
import { occurrencesOf } from './calendar';
import type { Occurrence } from './calendar';
import { holderOf } from './projectRules';
import { addDays, dayInZone } from './schedule';
import { zonedInstant, zonedWall } from './zoned';

// The day's items in order: events, imported items, tasks due, the dinner and projects with a planned day. Worked out on the device each time and
// never stored: each source keeps its own cache. Pure, so the day view, the week view and "Now and next" read the same thing.
export interface TimelineMember {
  userId: string;
  displayName: string;
}

export interface TimelineInputs {
  // As the viewer may see them: someone else's private event is a busy view.
  events: EventOrBusy[];
  tasks: Task[];
  // The plan's dinner for the day, with its title as it should be shown.
  dinner?: { title: string };
  // Projects as the household's list gives them (the light read). Only an active, undeleted one with a planned day is shown.
  projects?: TimelineProject[];
  members: TimelineMember[];
  // Imported occurrences as the viewer may see them, with their feeds (to know whose they are) and the zone their instants are read in.
  // Without a zone no imported item can be placed on a day, so none is shown.
  imported?: ImportedView[];
  feeds?: FeedView[];
  timezone?: string;
}

export type TimelineProject = Pick<Project, 'id' | 'title' | 'status' | 'plannedOn' | 'plannedEndOn' | 'takenBy' | 'deletedAt'>;

export type TimelineType = 'event' | 'block' | 'busy' | 'task' | 'dinner' | 'imported' | 'project';

export interface TimelineItem {
  // Stable and unique for the day: the same events give the same keys in any order.
  key: string;
  type: TimelineType;
  // The words to show: the title, "Busy", "Due: {title}" or "Dinner: {title}".
  label: string;
  // Who it is for, in words ("Sam", "Alex", "Both"). Empty for the dinner.
  who: string;
  forViewer: boolean;
  allDay: boolean;
  // The day it starts on.
  on: string;
  startTime?: string;
  endOn: string;
  endTime?: string;
  endsNextDay: boolean;
  place?: string;
  eventId?: string;
  taskId?: string;
  projectId?: string;
  // An imported item's feed, so the screen can say when that feed was last updated, and whether its time could not be read exactly.
  feedId?: string;
  approx?: true;
}

export interface Timeline {
  allDay: TimelineItem[];
  timed: TimelineItem[];
}

const BUSY = 'Busy';
const BOTH = 'Both';
const FORMER = 'Former member';
const ALL_DAY_ORDER: Record<TimelineType, number> = { event: 0, block: 0, busy: 0, imported: 0, task: 1, dinner: 2, project: 3 };

const nameOf = (members: TimelineMember[], userId: string): string => members.find(member => member.userId === userId)?.displayName ?? FORMER;
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function eventItems(day: string, event: EventOrBusy, inputs: TimelineInputs, viewer: string): TimelineItem[] {
  const full = event.busy === true ? undefined : event;
  const owner = event.busy === true ? event.owner : '';
  const who = full ? (full.who === 'both' ? BOTH : nameOf(inputs.members, full.who)) : owner;
  const forViewer = full !== undefined && (full.who === 'both' || full.who === viewer);
  const type: TimelineType = full ? full.kind : 'busy';

  return occurrencesOf(event, day, day).flatMap((occurrence: Occurrence): TimelineItem[] => {
    // A timed item belongs to the day it starts. An all-day one is shown on every day it covers.
    if (occurrence.allDay ? occurrence.on > day || occurrence.endOn < day : occurrence.on !== day) return [];
    const item: TimelineItem = {
      key: `${event.id}#${occurrence.on}`, type, label: full ? full.title : BUSY, who, forViewer, allDay: occurrence.allDay,
      on: occurrence.on, endOn: occurrence.endOn, endsNextDay: !occurrence.allDay && occurrence.endOn !== occurrence.on,
      ...(full ? { eventId: full.id } : {}),
    };
    if (occurrence.startTime !== undefined) item.startTime = occurrence.startTime;
    if (occurrence.endTime !== undefined) item.endTime = occurrence.endTime;
    if (full?.place !== undefined) item.place = full.place;
    return [item];
  });
}

const hhmm = (seconds: number): string => `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}`;

function importedItem(day: string, view: ImportedView, inputs: TimelineInputs, zone: string): TimelineItem | undefined {
  const mine = inputs.feeds?.find(feed => feed.id === view.feedId)?.mine === true;
  const base = {
    type: (view.busy === true ? 'busy' : 'imported') as TimelineType, label: view.busy === true ? BUSY : view.title ?? BUSY, who: view.owner, forViewer: mine,
    feedId: view.feedId, ...(view.approx === true ? { approx: true as const } : {}),
  };
  if (view.allDay) {
    if (view.startOn === undefined || view.endOn === undefined || view.startOn > day || view.endOn < day) return undefined;
    return { ...base, key: '', allDay: true, on: view.startOn, endOn: view.endOn, endsNextDay: false };
  }
  if (view.startMs === undefined) return undefined;
  const start = zonedWall(view.startMs, zone);
  if (start.day !== day) return undefined;
  const end = zonedWall(view.endMs ?? view.startMs, zone);
  return { ...base, key: '', allDay: false, on: start.day, startTime: hhmm(start.seconds), endOn: end.day, endTime: hhmm(end.seconds), endsNextDay: end.day !== start.day };
}

// Two identical items keep distinct keys, and the key does not depend on the order they arrived in.
function importedItems(day: string, inputs: TimelineInputs): TimelineItem[] {
  const zone = inputs.timezone;
  if (zone === undefined) return [];
  const seen = new Map<string, number>();
  return (inputs.imported ?? []).flatMap((view): TimelineItem[] => {
    const item = importedItem(day, view, inputs, zone);
    if (!item) return [];
    const base = `imported#${view.feedId}#${item.on}#${item.startTime ?? ''}#${item.endOn}#${item.endTime ?? ''}#${item.label}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return [{ ...item, key: count === 0 ? base : `${base}#${count}` }];
  });
}

function taskItem(task: Task, day: string, inputs: TimelineInputs, viewer: string): TimelineItem {
  const owner = effectiveAssignee(task, { members: inputs.members });
  const who = owner === 'both' ? BOTH : owner === 'either' ? 'Anyone' : nameOf(inputs.members, owner);
  return {
    key: `task#${task.id}`, type: 'task', label: `Due: ${task.title}`, who, forViewer: owner === viewer || owner === 'both' || owner === 'either',
    allDay: true, on: day, endOn: day, endsNextDay: false, taskId: task.id,
  };
}

// A project with a planned day is a strip item on each day from the start to the end (or the one day). It is not a deadline: nothing
// about it changes when the day passes, and the label says "Project", never a due date. A departed holder shows as no one.
function projectItems(day: string, inputs: TimelineInputs): TimelineItem[] {
  return (inputs.projects ?? []).flatMap((project): TimelineItem[] => {
    if (project.status !== 'active' || project.deletedAt !== undefined || project.plannedOn === undefined) return [];
    if (project.plannedOn > day || (project.plannedEndOn ?? project.plannedOn) < day) return [];
    const holder = holderOf(project, inputs.members);
    return [{
      key: `project:${project.id}:${day}`, type: 'project', label: `Project: ${project.title}`, who: holder === undefined ? '' : nameOf(inputs.members, holder),
      forViewer: true, allDay: true, on: day, endOn: day, endsNextDay: false, projectId: project.id,
    }];
  });
}

const byAllDay = (a: TimelineItem, b: TimelineItem): number =>
  ALL_DAY_ORDER[a.type] - ALL_DAY_ORDER[b.type] || compare(a.label, b.label) || compare(a.key, b.key);
const byStart = (a: TimelineItem, b: TimelineItem): number =>
  compare(a.startTime ?? '', b.startTime ?? '') || compare(a.who, b.who) || compare(a.label, b.label) || compare(a.key, b.key);

export function buildTimeline(day: string, inputs: TimelineInputs, viewer: string): Timeline {
  const fromEvents = [...inputs.events.flatMap(event => eventItems(day, event, inputs, viewer)), ...importedItems(day, inputs)];
  const tasks = inputs.tasks
    .filter(task => task.status === 'open' && task.deletedAt === undefined && task.dueOn === day)
    .map(task => taskItem(task, day, inputs, viewer));
  const dinner: TimelineItem[] = inputs.dinner === undefined ? [] : [{
    key: 'dinner', type: 'dinner', label: `Dinner: ${inputs.dinner.title}`, who: '', forViewer: true, allDay: true, on: day, endOn: day, endsNextDay: false,
  }];
  return {
    allDay: [...fromEvents.filter(item => item.allDay), ...tasks, ...dinner, ...projectItems(day, inputs)].sort(byAllDay),
    timed: fromEvents.filter(item => !item.allDay).sort(byStart),
  };
}

export interface NowAndNext {
  // The timed item in progress for the viewer, or for both of them.
  now: TimelineItem | undefined;
  // The next item to start today, whoever it is for.
  next: TimelineItem | undefined;
}

interface Placed {
  item: TimelineItem;
  startMs: number;
  endMs: number;
}

// "Now" is compared with the clock, not with the wall-clock text: start and end are turned into instants only for this comparison, so across a clock change the comparison uses real elapsed time (what is shown stays wall-clock). Yesterday's
// items are read too, so something that started the evening before and runs past midnight is found.
export function nowAndNext(inputs: TimelineInputs, nowMs: number, timeZone: string, viewer: string): NowAndNext {
  const today = dayInZone(nowMs, timeZone);
  const placed: Placed[] = [addDays(today, -1), today].flatMap(day => buildTimeline(day, inputs, viewer).timed).map(item => ({
    item,
    startMs: zonedInstant(item.on, item.startTime ?? '00:00', timeZone),
    endMs: zonedInstant(item.endOn, item.endTime ?? '00:00', timeZone),
  }));

  const running = placed.filter(entry => entry.item.forViewer && entry.item.type !== 'busy' && entry.startMs <= nowMs && nowMs < entry.endMs);
  const now = running.sort((a, b) => b.startMs - a.startMs || byStart(a.item, b.item))[0]?.item;
  const coming = placed.filter(entry => entry.item.on === today && entry.startMs > nowMs);
  const next = coming.sort((a, b) => a.startMs - b.startMs || byStart(a.item, b.item))[0]?.item;
  return { now, next };
}
