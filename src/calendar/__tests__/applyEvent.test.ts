import { describe, expect, it } from 'vitest';
import { applyEventDelete, applyEventRestore, applyEventWrite, applyReminders } from '../applyEvent';
import type { CalendarEvent, EventWrite, Schedule } from '../types';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const DAY = 86_400_000;
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
const ONE_OFF: Schedule = { startOn: '2026-12-02', allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' }, skipOn: [] };

const createWrite = (extra: EventWrite = {}): EventWrite => ({
  kind: 'event', title: { value: 'Dentist', at: NOW - 5000 }, schedule: { value: ONE_OFF, at: NOW - 5000 }, people: { value: { who: 'both', private: false }, at: NOW - 5000 }, ...extra,
});
const made = (extra: EventWrite = {}, by = U1): CalendarEvent => applyEventWrite(undefined, 'e1', createWrite(extra), by, NOW).event!;
const REMINDERS = { [U1]: { savedAt: NOW, list: [{ from: 'start' as const, minutes: 30 }] }, [U2]: { savedAt: NOW, list: [{ from: 'start' as const, minutes: 10 }] } };

describe('applyEventWrite: create', () => {
  it('builds an event from the three groups', () => {
    const outcome = applyEventWrite(undefined, 'e1', createWrite({ place: { value: 'Surgery', at: NOW - 1 } }), U1, NOW);
    expect(outcome.result).toBe('created');
    expect(outcome.event).toMatchObject({
      id: 'e1', kind: 'event', title: 'Dentist', place: 'Surgery', who: 'both', private: false, startOn: '2026-12-02', startTime: '10:30', reminders: {},
      createdBy: U1, createdAt: NOW, updatedAt: NOW, updatedBy: U1, fieldTimes: { title: NOW - 5000, place: NOW - 1, schedule: NOW - 5000, people: NOW - 5000 },
    });
  });

  it('does nothing for a create with a group missing', () => {
    const write = createWrite();
    delete write.title;
    expect(applyEventWrite(undefined, 'e1', write, U1, NOW).result).toBe('noop');
  });

  it('never leaves an attribute set to undefined or null', () => {
    const event = made();
    for (const [name, value] of Object.entries(event)) expect(value, name).not.toBeNull();
    expect('place' in event).toBe(false);
    expect('endOn' in event).toBe(false);
    expect('deletedAt' in event).toBe(false);
  });

  it('forces who to the creator on a private event', () => {
    const event = made({ people: { value: { who: U2, private: true }, at: NOW - 5000 } });
    expect(event).toMatchObject({ private: true, who: U1 });
  });

  it('expires a one-off event 400 days after its end date, and a repeating one never', () => {
    expect(made().expiresAt).toBe(Math.floor(Date.parse('2026-12-02T00:00:00Z') / 1000) + 400 * 86_400);
    const weekly = made({ schedule: { value: { ...ONE_OFF, repeat: { type: 'fixed', every: 1, unit: 'week', startOn: '2026-12-02' } }, at: NOW - 5000 } });
    expect('expiresAt' in weekly).toBe(false);
  });

  it('uses the end date of an all-day span for the expiry', () => {
    const span: Schedule = { startOn: '2026-12-02', allDay: true, endOn: '2026-12-04', repeat: { type: 'none' }, skipOn: [] };
    expect(made({ schedule: { value: span, at: NOW - 5000 } }).expiresAt).toBe(Math.floor(Date.parse('2026-12-04T00:00:00Z') / 1000) + 400 * 86_400);
  });

  it('clamps a client time far in the future to the server time', () => {
    expect(made({ title: { value: 'A', at: NOW + 10 * DAY } }).fieldTimes.title).toBe(NOW);
  });
});

describe('applyEventWrite: edit', () => {
  it('applies a newer title and keeps the rest', () => {
    const event = made();
    const outcome = applyEventWrite(event, 'e1', { title: { value: 'Hygienist', at: NOW - 100 } }, U2, NOW + 1000);
    expect(outcome.result).toBe('applied');
    expect(outcome.event).toMatchObject({ title: 'Hygienist', startTime: '10:30', updatedBy: U2, updatedAt: NOW + 1000 });
  });

  it('ignores an older write to a field and says nothing changed', () => {
    const event = made();
    const outcome = applyEventWrite(event, 'e1', { title: { value: 'Old', at: NOW - 9000 } }, U2, NOW);
    expect(outcome.result).toBe('noop');
    expect(outcome.event?.title).toBe('Dentist');
  });

  it('applies a schedule group together or not at all', () => {
    const event = made();
    const newer: Schedule = { ...ONE_OFF, startOn: '2026-12-03', startTime: '14:00', durationMin: 30 };
    const edited = applyEventWrite(event, 'e1', { schedule: { value: newer, at: NOW - 100 } }, U2, NOW).event!;
    expect(edited).toMatchObject({ startOn: '2026-12-03', startTime: '14:00', durationMin: 30 });
    // A second person's older edit of the same group does not mix in a time nobody chose.
    const older: Schedule = { ...ONE_OFF, startTime: '08:00', durationMin: 90 };
    const kept = applyEventWrite(edited, 'e1', { schedule: { value: older, at: NOW - 200 } }, U1, NOW + 5);
    expect(kept.result).toBe('noop');
    expect(kept.event).toMatchObject({ startOn: '2026-12-03', startTime: '14:00', durationMin: 30 });
  });

  it('drops attributes the new schedule group does not have', () => {
    const span: Schedule = { startOn: '2026-12-02', allDay: true, endOn: '2026-12-04', repeat: { type: 'none' }, skipOn: [] };
    const event = made();
    const edited = applyEventWrite(event, 'e1', { schedule: { value: span, at: NOW - 100 } }, U1, NOW).event!;
    expect('startTime' in edited).toBe(false);
    expect('durationMin' in edited).toBe(false);
    expect(edited.endOn).toBe('2026-12-04');
  });

  it('clears a place or notes with an empty string', () => {
    const event = made({ place: { value: 'Surgery', at: NOW - 3000 }, notes: { value: 'Forms', at: NOW - 3000 } });
    const edited = applyEventWrite(event, 'e1', { place: { value: '', at: NOW - 100 }, notes: { value: '', at: NOW - 100 } }, U1, NOW).event!;
    expect('place' in edited).toBe(false);
    expect('notes' in edited).toBe(false);
  });

  it('moves updatedAt forward even when the clock has not', () => {
    const event = made();
    expect(applyEventWrite(event, 'e1', { title: { value: 'A', at: NOW - 100 } }, U1, NOW - 50_000).event?.updatedAt).toBe(NOW + 1);
  });

  it('answers gone for a deleted event', () => {
    const deleted = applyEventDelete(made(), U1, NOW).event!;
    expect(applyEventWrite(deleted, 'e1', { title: { value: 'B', at: NOW } }, U1, NOW).result).toBe('gone');
  });

  it('keeps the kind of an event whatever an edit says', () => {
    const edited = applyEventWrite(made(), 'e1', { kind: 'block', title: { value: 'B', at: NOW - 1 } }, U1, NOW).event!;
    expect(edited.kind).toBe('event');
  });
});

describe('private events', () => {
  const privateEvent = (): CalendarEvent => made({ people: { value: { who: U1, private: true }, at: NOW - 5000 } });

  it('refuses any write, delete and reminder change from the other person', () => {
    const event = privateEvent();
    expect(applyEventWrite(event, 'e1', { title: { value: 'B', at: NOW } }, U2, NOW + 1).result).toBe('private');
    expect(applyEventDelete(event, U2, NOW + 1).result).toBe('private');
    expect(applyReminders(event, U2, [{ from: 'start', minutes: 5 }], NOW + 1).result).toBe('private');
    expect(applyEventRestore({ ...event, deletedAt: NOW, deletedBy: U1 }, U2, NOW + 1).result).toBe('private');
  });

  it('lets the creator change it and make it public again', () => {
    const event = privateEvent();
    const open = applyEventWrite(event, 'e1', { people: { value: { who: 'both', private: false }, at: NOW - 100 } }, U1, NOW).event!;
    expect(open).toMatchObject({ private: false, who: 'both' });
  });

  it('only lets the creator set or clear private', () => {
    const shared = made();
    expect(applyEventWrite(shared, 'e1', { people: { value: { who: 'both', private: true }, at: NOW - 100 } }, U2, NOW).result).toBe('private');
  });

  it('lets the other person change who a shared event is for, without touching private', () => {
    const shared = made();
    const edited = applyEventWrite(shared, 'e1', { people: { value: { who: U2, private: false }, at: NOW - 100 } }, U2, NOW).event!;
    expect(edited).toMatchObject({ who: U2, private: false });
  });

  it('removes every other member\'s reminders in the write that makes it private', () => {
    const shared = { ...made(), reminders: REMINDERS };
    const flipped = applyEventWrite(shared, 'e1', { people: { value: { who: U1, private: true }, at: NOW - 100 } }, U1, NOW).event!;
    expect(Object.keys(flipped.reminders)).toEqual([U1]);
  });

  it('does not make it private from an older write (no reminders are lost either)', () => {
    const shared = { ...made(), reminders: REMINDERS };
    const kept = applyEventWrite(shared, 'e1', { people: { value: { who: U1, private: true }, at: NOW - 9000 } }, U1, NOW);
    expect(kept.result).toBe('noop');
    expect(Object.keys(kept.event!.reminders).sort()).toEqual([U1, U2]);
  });
});

describe('applyReminders', () => {
  const list = [{ from: 'start' as const, minutes: 30 }];

  it('sets the caller\'s own entry with the save time and leaves the other person\'s alone', () => {
    const event = { ...made(), reminders: { [U2]: REMINDERS[U2] } };
    const outcome = applyReminders(event, U1, list, NOW + 7);
    expect(outcome.result).toBe('applied');
    expect(outcome.event?.reminders).toEqual({ [U1]: { savedAt: NOW + 7, list }, [U2]: REMINDERS[U2] });
    expect(outcome.event?.updatedAt).toBe(NOW + 7);
    expect(outcome.event?.updatedBy).toBe(U1);
  });

  it('an empty list removes the caller\'s entry', () => {
    const event = { ...made(), reminders: REMINDERS };
    expect(Object.keys(applyReminders(event, U1, [], NOW + 1).event!.reminders)).toEqual([U2]);
  });

  it('is a no-op to clear reminders that are not there', () => {
    expect(applyReminders(made(), U1, [], NOW + 1).result).toBe('noop');
  });

  it('refuses reminders on an all-day event', () => {
    const allDay = made({ schedule: { value: { startOn: '2026-12-02', allDay: true, repeat: { type: 'none' }, skipOn: [] }, at: NOW - 5000 } });
    expect(applyReminders(allDay, U1, list, NOW + 1)).toEqual({ result: 'invalid' });
  });

  it('allows "at the end" on a block only', () => {
    const end = [{ from: 'end' as const, minutes: 0 }];
    expect(applyReminders(made(), U1, end, NOW + 1)).toEqual({ result: 'invalid' });
    expect(applyReminders(made({ kind: 'block' }), U1, end, NOW + 1).result).toBe('applied');
  });

  it('refuses more than 3 reminders', () => {
    const four = [0, 5, 10, 15].map(minutes => ({ from: 'start' as const, minutes }));
    expect(applyReminders(made(), U1, four, NOW + 1)).toEqual({ result: 'limit' });
  });

  it('answers gone for a deleted event', () => {
    expect(applyReminders(applyEventDelete(made(), U1, NOW).event!, U1, list, NOW + 1).result).toBe('gone');
  });
});

describe('applyEventDelete and applyEventRestore', () => {
  it('writes a tombstone that expires in 30 days and moves updatedAt', () => {
    const outcome = applyEventDelete(made(), U2, NOW);
    expect(outcome.result).toBe('applied');
    expect(outcome.event).toMatchObject({ deletedAt: NOW, deletedBy: U2, expiresAt: Math.floor(NOW / 1000) + 30 * 86_400, updatedAt: NOW + 1 });
  });

  it('is a no-op to delete again', () => {
    expect(applyEventDelete(applyEventDelete(made(), U1, NOW).event!, U1, NOW + 5).result).toBe('noop');
  });

  it('a restore removes the tombstone and puts back the expiry of a one-off event', () => {
    const deleted = applyEventDelete(made(), U1, NOW).event!;
    const restored = applyEventRestore(deleted, U1, NOW + 10).event!;
    expect('deletedAt' in restored).toBe(false);
    expect('deletedBy' in restored).toBe(false);
    expect(restored.expiresAt).toBe(made().expiresAt);
    expect(restored.updatedAt).toBe(NOW + 10);
  });

  it('a restore of a repeating event leaves no expiry', () => {
    const weekly = made({ schedule: { value: { ...ONE_OFF, repeat: { type: 'fixed', every: 1, unit: 'week', startOn: '2026-12-02' } }, at: NOW - 5000 } });
    const restored = applyEventRestore(applyEventDelete(weekly, U1, NOW).event!, U1, NOW + 1).event!;
    expect('expiresAt' in restored).toBe(false);
  });

  it('a restore of a live event does nothing', () => {
    expect(applyEventRestore(made(), U1, NOW).result).toBe('noop');
  });
});
