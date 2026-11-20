import { describe, expect, it } from 'vitest';
import { applyEventWrite } from '../applyEvent';
import { projectFor } from '../project';
import type { CalendarEvent } from '../types';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
const SECRET = 'SENTINEL-counselling';

function make(isPrivate: boolean): CalendarEvent {
  const event = applyEventWrite(undefined, 'e1', {
    kind: 'event', title: { value: SECRET, at: NOW - 1 }, place: { value: `${SECRET}-place`, at: NOW - 1 }, notes: { value: `${SECRET}-notes`, at: NOW - 1 },
    schedule: { value: { startOn: '2026-12-02', allDay: false, startTime: '17:00', durationMin: 60, repeat: { type: 'fixed', every: 1, unit: 'week', startOn: '2026-12-02' }, repeatEndsOn: '2027-01-01', skipOn: ['2026-12-09'] }, at: NOW - 1 },
    people: { value: { who: 'both', private: isPrivate }, at: NOW - 1 },
  }, U1, NOW).event!;
  return { ...event, reminders: { [U1]: { savedAt: NOW, list: [{ from: 'start', minutes: 30 }] }, [U2]: { savedAt: NOW, list: [{ from: 'start', minutes: 5 }] } } };
}

describe('projectFor', () => {
  it('gives the creator all of a private event, with only their own reminders', () => {
    const view = projectFor(U1, make(true), 'Sam');
    expect(view).toMatchObject({ title: SECRET, place: `${SECRET}-place`, notes: `${SECRET}-notes`, private: true });
    expect(Object.keys((view as CalendarEvent).reminders)).toEqual([U1]);
  });

  it('gives the other person only where a private event falls and the creator\'s name', () => {
    const view = projectFor(U2, make(true), 'Sam');
    expect(view).toEqual({
      id: 'e1', busy: true, owner: 'Sam', startOn: '2026-12-02', allDay: false, startTime: '17:00', durationMin: 60,
      repeat: { type: 'fixed', every: 1, unit: 'week', startOn: '2026-12-02' }, repeatEndsOn: '2027-01-01', skipOn: ['2026-12-09'],
    });
  });

  it('never lets any text of a private event into the other person\'s view', () => {
    expect(JSON.stringify(projectFor(U2, make(true), 'Sam'))).not.toContain('SENTINEL');
  });

  it('gives both people all of an event that is not private, each with only their own reminders', () => {
    const forOther = projectFor(U2, make(false), 'Sam') as CalendarEvent;
    expect(forOther.title).toBe(SECRET);
    expect(forOther.reminders).toEqual({ [U2]: { savedAt: NOW, list: [{ from: 'start', minutes: 5 }] } });
    const forCreator = projectFor(U1, make(false), 'Sam') as CalendarEvent;
    expect(Object.keys(forCreator.reminders)).toEqual([U1]);
  });

  it('does not change the event it is given', () => {
    const event = make(false);
    projectFor(U2, event, 'Sam');
    expect(Object.keys(event.reminders).sort()).toEqual([U1, U2]);
  });

  it('leaves out the end date of a timed busy item that does not have one', () => {
    const view = projectFor(U2, make(true), 'Sam');
    expect('endOn' in view).toBe(false);
  });
});
