import type { EventOrBusy } from '../calendar/types';
import { effectiveAssignee } from '../tasks/ownership';
import type { Task } from '../tasks/types';
import { occurrencesOf } from './calendar';
import type { Occurrence } from './calendar';
import { addDays, dayInZone } from './schedule';
import { zonedInstant } from './zoned';

// The day's items in order: events, imported items (a later step), tasks due and the dinner. Worked out on the device each time and
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
  members: TimelineMember[];
}

export type TimelineType = 'event' | 'block' | 'busy' | 'task' | 'dinner';

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
}

export interface Timeline {
  allDay: TimelineItem[];
  timed: TimelineItem[];
}

const BUSY = 'Busy';
const BOTH = 'Both';
const FORMER = 'Former member';
const ALL_DAY_ORDER: Record<TimelineType, number> = { event: 0, block: 0, busy: 0, task: 1, dinner: 2 };

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

function taskItem(task: Task, day: string, inputs: TimelineInputs, viewer: string): TimelineItem {
  const owner = effectiveAssignee(task, { members: inputs.members });
  const who = owner === 'both' ? BOTH : owner === 'either' ? 'Anyone' : nameOf(inputs.members, owner);
  return {
    key: `task#${task.id}`, type: 'task', label: `Due: ${task.title}`, who, forViewer: owner === viewer || owner === 'both' || owner === 'either',
    allDay: true, on: day, endOn: day, endsNextDay: false, taskId: task.id,
  };
}

const byAllDay = (a: TimelineItem, b: TimelineItem): number =>
  ALL_DAY_ORDER[a.type] - ALL_DAY_ORDER[b.type] || compare(a.label, b.label) || compare(a.key, b.key);
const byStart = (a: TimelineItem, b: TimelineItem): number =>
  compare(a.startTime ?? '', b.startTime ?? '') || compare(a.who, b.who) || compare(a.label, b.label) || compare(a.key, b.key);

export function buildTimeline(day: string, inputs: TimelineInputs, viewer: string): Timeline {
  const fromEvents = inputs.events.flatMap(event => eventItems(day, event, inputs, viewer));
  const tasks = inputs.tasks
    .filter(task => task.status === 'open' && task.deletedAt === undefined && task.dueOn === day)
    .map(task => taskItem(task, day, inputs, viewer));
  const dinner: TimelineItem[] = inputs.dinner === undefined ? [] : [{
    key: 'dinner', type: 'dinner', label: `Dinner: ${inputs.dinner.title}`, who: '', forViewer: true, allDay: true, on: day, endOn: day, endsNextDay: false,
  }];
  return {
    allDay: [...fromEvents.filter(item => item.allDay), ...tasks, ...dinner].sort(byAllDay),
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

// "Now" is compared with the clock, not with the wall-clock text: across a clock change the minutes are the real ones. Yesterday's
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
