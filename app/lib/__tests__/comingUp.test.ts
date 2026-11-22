import { describe, expect, it } from 'vitest';
import type { CalendarEvent, EventView } from '../../../src/calendar/types';
import type { TimelineInputs } from '../../../src/shared/timeline';
import { comingUp, projectLines } from '../comingUp';
import type { ListedProject } from '../projects';

const SAM = 'u-sam';
const ALEX = 'u-alex';
const MEMBERS = [{ userId: SAM, displayName: 'Sam', joinedAt: '' }, { userId: ALEX, displayName: 'Alex', joinedAt: '' }];
const TODAY = '2026-11-21';
const NONE = { type: 'none' as const };

const event = (id: string, startOn: string, over: Partial<CalendarEvent> = {}): EventView => ({
  id, kind: 'event', title: id, who: 'both', private: false, startOn, allDay: false, startTime: '10:00', durationMin: 60, repeat: NONE, skipOn: [], reminders: {},
  fieldTimes: {}, createdBy: SAM, createdAt: 1, updatedAt: 1, updatedBy: SAM, ...over,
});
const inputs = (events: EventView[], over: Partial<TimelineInputs> = {}) => () => ({ events, tasks: [], members: MEMBERS, ...over }) as TimelineInputs;

describe('comingUp', () => {
  it('lists the calendar items of the next three days in order, with the day and time, and not today', () => {
    const items = comingUp(inputs([event('Today thing', TODAY), event('Dentist', '2026-11-24', { startTime: '10:30' }), event('Call', '2026-11-22', { startTime: '09:00' })]), TODAY, SAM);
    expect(items.map(item => [item.dayText, item.time, item.label])).toEqual([['Sun 22 Nov', '09:00', 'Call'], ['Tue 24 Nov', '10:30', 'Dentist']]);
  });

  it('stops at three items', () => {
    const many = ['22', '23', '24'].flatMap(day => [event(`a${day}`, `2026-11-${day}`), event(`b${day}`, `2026-11-${day}`, { startTime: '11:00' })]);
    expect(comingUp(inputs(many), TODAY, SAM)).toHaveLength(3);
  });

  it('looks no further than three days ahead', () => {
    expect(comingUp(inputs([event('Far', '2026-11-26')]), TODAY, SAM)).toEqual([]);
  });

  it('leaves out tasks due and the dinner, which have their own places', () => {
    const task = { id: 't', title: 'Bins', fieldTimes: {}, assignee: SAM, repeat: NONE, cycleSeq: 1, ruleVersion: 1, checklist: [], checklistState: {}, status: 'open', createdBy: SAM, updatedAt: 1, dueOn: '2026-11-22' };
    expect(comingUp(inputs([], { tasks: [task as never], dinner: { title: 'Chilli' } }), TODAY, SAM)).toEqual([]);
  });

  it('shows the other person\'s private event as Busy, never its words', () => {
    const busy = { id: 'p', busy: true as const, owner: 'Alex', startOn: '2026-11-22', allDay: false, startTime: '17:00', durationMin: 60, repeat: NONE, skipOn: [] };
    const items = comingUp(inputs([busy as never]), TODAY, SAM);
    expect(items[0]).toMatchObject({ label: 'Busy', who: 'Alex' });
  });
});

describe('projectLines', () => {
  const project = (id: string, over: Partial<ListedProject> = {}): ListedProject => ({
    id, title: id, status: 'active', fieldTimes: {}, createdBy: SAM, createdAt: 1, updatedAt: 1, updatedBy: SAM, counts: { steps: 5, done: 0, materials: 0, held: {} }, ...over,
  });

  it('says how many steps the other person holds, and nothing for steps this person holds', () => {
    const lines = projectLines([project('Decking', { counts: { steps: 5, done: 1, materials: 0, held: { [ALEX]: 2, [SAM]: 1 } } })], TODAY, SAM, MEMBERS);
    expect(lines).toEqual([{ id: 'Decking', text: 'Alex has 2 steps in Decking' }]);
    expect(projectLines([project('One', { counts: { steps: 1, done: 0, materials: 0, held: { [ALEX]: 1 } } })], TODAY, SAM, MEMBERS)[0].text).toBe('Alex has 1 step in One');
  });

  it('says a project is planned when its day is within a week, and not before today or after a week', () => {
    const lines = projectLines([
      project('Soon', { plannedOn: '2026-11-25' }), project('Past', { plannedOn: '2026-11-20' }), project('Far', { plannedOn: '2026-11-29' }),
    ], TODAY, SAM, MEMBERS);
    expect(lines).toEqual([{ id: 'Soon', text: 'Soon: planned for Wednesday 25 November' }]);
  });

  it('is one line for a project at most, finished and deleted projects give none, and at most three lines', () => {
    const lines = projectLines([
      project('A', { plannedOn: '2026-11-22', counts: { steps: 2, done: 0, materials: 0, held: { [ALEX]: 1 } } }),
      project('Done', { status: 'finished', plannedOn: '2026-11-22' }), project('Gone', { plannedOn: '2026-11-22', deletedAt: 5 }),
      project('B', { plannedOn: '2026-11-22' }), project('C', { plannedOn: '2026-11-22' }), project('D', { plannedOn: '2026-11-22' }),
    ], TODAY, SAM, MEMBERS);
    expect(lines.map(line => line.id)).toEqual(['A', 'B', 'C']);
    expect(lines[0].text).toBe('Alex has 1 step in A');
  });

  it('says the other person has a whole project when they hold it, and ignores a holder who has left', () => {
    expect(projectLines([project('Mine'), project('Theirs', { takenBy: ALEX, takenAt: 1 })], TODAY, SAM, MEMBERS)).toEqual([{ id: 'Theirs', text: 'Alex has the project Theirs' }]);
    expect(projectLines([project('Gone', { takenBy: 'u-left', takenAt: 1 })], TODAY, SAM, MEMBERS)).toEqual([]);
  });

  it('says nothing for a project nobody has and nothing is planned for', () => {
    expect(projectLines([project('Quiet')], TODAY, SAM, MEMBERS)).toEqual([]);
  });
});
