import { describe, expect, it } from 'vitest';
import type { BusyView, CalendarEvent, EventOrBusy, EventView } from '../../calendar/types';
import type { Task } from '../../tasks/types';
import { zonedInstant } from '../zoned';
import { buildTimeline, nowAndNext } from '../timeline';
import type { TimelineInputs } from '../timeline';

const SAM = 'u-sam';
const ALEX = 'u-alex';
const MEMBERS = [{ userId: SAM, displayName: 'Sam' }, { userId: ALEX, displayName: 'Alex' }];
const LONDON = 'Europe/London';
const NONE = { type: 'none' as const };

const event = (id: string, over: Partial<CalendarEvent> = {}): EventView => ({
  id, kind: 'event', title: id, who: 'both', private: false, startOn: '2026-11-16', allDay: false, startTime: '10:00', durationMin: 60, repeat: NONE, skipOn: [],
  reminders: {}, fieldTimes: {}, createdBy: SAM, createdAt: 1, updatedAt: 1, updatedBy: SAM, ...over,
});
const busy = (id: string, over: Partial<BusyView> = {}): BusyView => ({
  id, busy: true, owner: 'Alex', startOn: '2026-11-16', allDay: false, startTime: '17:00', durationMin: 60, repeat: NONE, skipOn: [], ...over,
});
const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id, fieldTimes: {}, assignee: SAM, repeat: NONE, cycleSeq: 1, ruleVersion: 1, checklist: [], checklistState: {}, status: 'open', createdBy: SAM, updatedAt: 1,
  dueOn: '2026-11-16', ...over,
});
const inputs = (events: EventOrBusy[] = [], over: Partial<TimelineInputs> = {}): TimelineInputs => ({ events, tasks: [], members: MEMBERS, ...over });
const labels = (items: { label: string }[]): string[] => items.map(item => item.label);

describe('buildTimeline', () => {
  it('lists timed items in start order, with a start, an end and who each is for in words', () => {
    const { timed } = buildTimeline('2026-11-16', inputs([
      event('Work meeting', { startTime: '14:00', who: SAM }), event('Dentist', { startTime: '10:30', durationMin: 45, who: ALEX, place: 'At the surgery' }),
    ]), SAM);
    expect(timed.map(item => [item.label, item.startTime, item.endTime, item.who, item.place])).toEqual([
      ['Dentist', '10:30', '11:15', 'Alex', 'At the surgery'], ['Work meeting', '14:00', '15:00', 'Sam', undefined],
    ]);
  });

  it('says Both for an event for both, and Former member for someone who has left', () => {
    const { timed } = buildTimeline('2026-11-16', inputs([event('a', { who: 'both' }), event('b', { who: 'u-gone', startTime: '11:00' })]), SAM);
    expect(timed.map(item => item.who)).toEqual(['Both', 'Former member']);
  });

  it('shows another person\'s private event as Busy with its owner, and nothing else', () => {
    const { timed } = buildTimeline('2026-11-16', inputs([busy('p')]), SAM);
    expect(timed[0]).toMatchObject({ label: 'Busy', who: 'Alex', type: 'busy', startTime: '17:00', endTime: '18:00', forViewer: false });
    expect(timed[0].place).toBeUndefined();
    expect(timed[0].eventId).toBeUndefined();
  });

  it('puts all-day items, tasks due and the dinner in a strip, tasks then dinner', () => {
    const { allDay, timed } = buildTimeline('2026-11-16', inputs([event('Birthday', { allDay: true, startTime: undefined, durationMin: undefined })], {
      tasks: [task('Bins')], dinner: { title: 'Chilli' },
    }), SAM);
    expect(labels(allDay)).toEqual(['Birthday', 'Due: Bins', 'Dinner: Chilli']);
    expect(allDay.map(item => item.who)).toEqual(['Both', 'Sam', '']);
    expect(timed).toEqual([]);
  });

  it('shows a task on its due date only, and not a done or deleted one', () => {
    const tasks = [task('today'), task('tomorrow', { dueOn: '2026-11-17' }), task('earlier', { dueOn: '2026-11-15' }), task('done', { status: 'done' }), task('gone', { deletedAt: 5 }), task('undated', { dueOn: undefined })];
    expect(labels(buildTimeline('2026-11-16', inputs([], { tasks }), SAM).allDay)).toEqual(['Due: today']);
  });

  it('names the person a task is for, including a swap for this time, anyone and both', () => {
    const tasks = [
      task('a', { assignee: ALEX }), task('b', { assignee: 'both' }), task('c', { assignee: 'either' }), task('d', { assignee: ALEX, overrideAssignee: SAM, overrideCycle: 1 }),
    ];
    expect(buildTimeline('2026-11-16', inputs([], { tasks }), SAM).allDay.map(item => item.who)).toEqual(['Alex', 'Both', 'Anyone', 'Sam']);
  });

  it('links a task to its page and the dinner to the plan', () => {
    const { allDay } = buildTimeline('2026-11-16', inputs([], { tasks: [task('t1')], dinner: { title: 'Chilli' } }), SAM);
    expect(allDay.map(item => item.taskId)).toEqual(['t1', undefined]);
    expect(allDay.map(item => item.type)).toEqual(['task', 'dinner']);
  });

  it('lists overlapping items one after another in start order', () => {
    const { timed } = buildTimeline('2026-11-16', inputs([event('b', { startTime: '10:30' }), event('a', { startTime: '10:00', durationMin: 120 })]), SAM);
    expect(labels(timed)).toEqual(['a', 'b']);
  });

  it('puts an overnight event on the day it starts, ending the next day', () => {
    const block = event('Sleep', { kind: 'block', startTime: '23:00', durationMin: 480 });
    const first = buildTimeline('2026-11-16', inputs([block]), SAM).timed[0];
    expect(first).toMatchObject({ startTime: '23:00', endTime: '07:00', endsNextDay: true, type: 'block' });
    expect(buildTimeline('2026-11-17', inputs([block]), SAM).timed).toEqual([]);
  });

  it('puts a many-day all-day event in the strip on each day it covers', () => {
    const trip = event('Trip', { allDay: true, startTime: undefined, durationMin: undefined, startOn: '2026-11-15', endOn: '2026-11-17' });
    expect([ '2026-11-14', '2026-11-15', '2026-11-17', '2026-11-18' ].map(day => buildTimeline(day, inputs([trip]), SAM).allDay.length)).toEqual([0, 1, 1, 0]);
  });

  it('expands a repeat, and leaves out a skipped day and a day after the repeat ends', () => {
    const walk = event('Walk', { startOn: '2026-11-16', repeat: { type: 'fixed', every: 1, unit: 'day', startOn: '2026-11-16' }, skipOn: ['2026-11-18'], repeatEndsOn: '2026-11-19' });
    const count = (day: string): number => buildTimeline(day, inputs([walk]), SAM).timed.length;
    expect([count('2026-11-16'), count('2026-11-17'), count('2026-11-18'), count('2026-11-19'), count('2026-11-20')]).toEqual([1, 1, 0, 1, 0]);
  });

  it('gives the same timeline whatever order the events come in', () => {
    const events = [event('c', { startTime: '10:00' }), event('a', { startTime: '10:00', who: SAM }), event('b', { startTime: '09:00' }), busy('z', { startTime: '10:00' })];
    const forward = buildTimeline('2026-11-16', inputs(events), SAM);
    const backward = buildTimeline('2026-11-16', inputs([...events].reverse()), SAM);
    expect(backward).toEqual(forward);
  });

  it('marks what is for the viewer: their own and both, not the other person\'s', () => {
    const { timed } = buildTimeline('2026-11-16', inputs([event('mine', { who: SAM }), event('theirs', { who: ALEX, startTime: '11:00' }), event('both', { startTime: '12:00' })]), SAM);
    expect(timed.map(item => item.forViewer)).toEqual([true, false, true]);
  });
});

describe('nowAndNext', () => {
  const at = (day: string, time: string): number => zonedInstant(day, time, LONDON);
  const windDown = event('Wind down', { kind: 'block', startTime: '21:30', durationMin: 30, who: SAM });

  it('CUJ 5: says what is next before a block, and what is on, until when, during it', () => {
    const before = nowAndNext(inputs([windDown]), at('2026-11-16', '21:00'), LONDON, SAM);
    expect(before.now).toBeUndefined();
    expect(before.next).toMatchObject({ label: 'Wind down', startTime: '21:30' });
    const during = nowAndNext(inputs([windDown]), at('2026-11-16', '21:35'), LONDON, SAM);
    expect(during.now).toMatchObject({ label: 'Wind down', endTime: '22:00' });
    expect(during.next).toBeUndefined();
  });

  it('is over at the end moment: the end is not still in progress', () => {
    expect(nowAndNext(inputs([windDown]), at('2026-11-16', '22:00'), LONDON, SAM).now).toBeUndefined();
    expect(nowAndNext(inputs([windDown]), at('2026-11-16', '21:30'), LONDON, SAM).now).toMatchObject({ label: 'Wind down' });
  });

  it('CUJ 11: shows the other person\'s next item as Next, but only the viewer\'s own and shared items as Now', () => {
    const dentist = event('Dentist', { startTime: '10:30', who: ALEX });
    const work = event('Work meeting', { startTime: '14:00', who: SAM });
    const morning = nowAndNext(inputs([dentist, work]), at('2026-11-16', '08:00'), LONDON, SAM);
    expect(morning.now).toBeUndefined();
    expect(morning.next).toMatchObject({ label: 'Dentist', who: 'Alex', startTime: '10:30' });
    expect(nowAndNext(inputs([dentist, work]), at('2026-11-16', '10:45'), LONDON, SAM).now).toBeUndefined();
  });

  it('finds an overnight event that started yesterday, at 00:30', () => {
    const sleep = event('Sleep', { kind: 'block', startOn: '2026-11-16', startTime: '23:00', durationMin: 480, who: SAM });
    const result = nowAndNext(inputs([sleep]), at('2026-11-17', '00:30'), LONDON, SAM);
    expect(result.now).toMatchObject({ label: 'Sleep', endTime: '07:00' });
  });

  it('does not offer tomorrow\'s items as Next, or a task or a dinner as either', () => {
    const tomorrow = event('Later', { startOn: '2026-11-17' });
    const result = nowAndNext(inputs([tomorrow], { tasks: [task('Bins')], dinner: { title: 'Chilli' } }), at('2026-11-16', '09:00'), LONDON, SAM);
    expect(result).toEqual({ now: undefined, next: undefined });
  });

  it('shows the other person\'s busy item as Next, and the viewer\'s own private event as Now', () => {
    const counselling = event('Counselling', { private: true, who: SAM, startTime: '17:00' });
    expect(nowAndNext(inputs([busy('p', { startTime: '17:00' })]), at('2026-11-16', '16:00'), LONDON, SAM).next).toMatchObject({ label: 'Busy', who: 'Alex' });
    expect(nowAndNext(inputs([counselling]), at('2026-11-16', '17:10'), LONDON, SAM).now).toMatchObject({ label: 'Counselling' });
  });

  it('CUJ 6: an item inside the spring-forward gap starts at the first moment after it', () => {
    const walk = event('Early walk', { kind: 'block', startOn: '2026-03-29', startTime: '01:30', durationMin: 60, who: SAM });
    const gap = zonedInstant('2026-03-29', '01:30', LONDON);
    expect(gap).toBe(Date.UTC(2026, 2, 29, 1, 0));
    expect(nowAndNext(inputs([walk]), gap - 1, LONDON, SAM).next).toMatchObject({ label: 'Early walk' });
    expect(nowAndNext(inputs([walk]), gap, LONDON, SAM).now).toMatchObject({ label: 'Early walk' });
  });

  it('works in a zone with no daylight saving', () => {
    const lunch = event('Lunch', { startOn: '2026-03-29', startTime: '12:00', durationMin: 60, who: SAM });
    const now = zonedInstant('2026-03-29', '12:30', 'Asia/Kolkata');
    expect(nowAndNext(inputs([lunch]), now, 'Asia/Kolkata', SAM).now).toMatchObject({ label: 'Lunch' });
  });

  it('takes the one that started most recently when two are on', () => {
    const long = event('Long', { startTime: '09:00', durationMin: 300, who: SAM });
    const short = event('Short', { startTime: '10:00', durationMin: 60, who: SAM });
    expect(nowAndNext(inputs([long, short]), at('2026-11-16', '10:30'), LONDON, SAM).now?.label).toBe('Short');
  });
});
