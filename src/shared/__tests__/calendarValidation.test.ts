import { describe, expect, it } from 'vitest';
import { parseEventDelete, parseEventPut, parseRemindersPut } from '../calendarValidation';
import { parseRestoreBody } from '../taskValidation';

const ID = '00000000-0000-4000-8000-000000000001';
const AT = Date.parse('2026-11-14T10:00:00Z');
const SCHEDULE = { startOn: '2026-03-02', allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' } };
const create = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  mutationId: ID, kind: 'event', title: 'Dentist', titleAt: AT, ...SCHEDULE, scheduleAt: AT, who: 'both', private: false, peopleAt: AT, ...extra,
});
const field = (body: Record<string, unknown>): string | undefined => {
  const parsed = parseEventPut(body);
  return parsed.ok ? undefined : parsed.field;
};

describe('parseEventPut: create', () => {
  it('reads a whole create', () => {
    const parsed = parseEventPut(create({ place: 'Surgery', placeAt: AT, notes: 'Bring forms', notesAt: AT, notify: true, clientAt: AT }));
    expect(parsed).toEqual({
      ok: true,
      value: {
        mutationId: ID, clientAt: AT, kind: 'event',
        title: { value: 'Dentist', at: AT }, place: { value: 'Surgery', at: AT }, notes: { value: 'Bring forms', at: AT },
        schedule: { value: { startOn: '2026-03-02', allDay: false, startTime: '10:30', durationMin: 45, repeat: { type: 'none' }, skipOn: [] }, at: AT },
        people: { value: { who: 'both', private: false }, at: AT },
      },
    });
  });

  it.each([['title'], ['startOn'], ['who'], ['private']])('needs %s', name => {
    const body = create();
    delete body[name];
    expect(field(body)).toBe(name);
  });

  it('needs the times of its groups', () => {
    const noTitleAt = create(); delete noTitleAt.titleAt;
    expect(field(noTitleAt)).toBe('titleAt');
    const noScheduleAt = create(); delete noScheduleAt.scheduleAt;
    expect(field(noScheduleAt)).toBe('scheduleAt');
    const noPeopleAt = create(); delete noPeopleAt.peopleAt;
    expect(field(noPeopleAt)).toBe('peopleAt');
  });

  it('needs a mutation id and rejects an unknown key', () => {
    const body = create(); delete body.mutationId;
    expect(field(body)).toBe('mutationId');
    expect(field(create({ colour: 'blue' }))).toBe('colour');
  });

  it('accepts a block and refuses another kind', () => {
    expect(parseEventPut(create({ kind: 'block' })).ok).toBe(true);
    expect(field(create({ kind: 'task' }))).toBe('kind');
  });
});

describe('parseEventPut: limits', () => {
  it('holds a title to 80 characters and a place to 80, notes to 500', () => {
    expect(field(create({ title: 'x'.repeat(81) }))).toBe('title');
    expect(field(create({ title: 'x'.repeat(80) }))).toBeUndefined();
    expect(field(create({ place: 'x'.repeat(81), placeAt: AT }))).toBe('place');
    expect(field(create({ notes: 'x'.repeat(501), notesAt: AT }))).toBe('notes');
    expect(field(create({ notes: 'x'.repeat(500), notesAt: AT }))).toBeUndefined();
  });

  it('lets a place and notes be cleared with an empty string', () => {
    expect(field(create({ place: '', placeAt: AT, notes: '', notesAt: AT }))).toBeUndefined();
  });

  it('refuses either as who, and accepts a user id', () => {
    expect(field(create({ who: 'either' }))).toBe('who');
    expect(field(create({ who: 'auth0|u1' }))).toBeUndefined();
    expect(field(create({ who: '' }))).toBe('who');
  });

  it('refuses a private that is not a boolean', () => {
    expect(field(create({ private: 'yes' }))).toBe('private');
  });
});

describe('parseEventPut: schedule', () => {
  it('needs a start time and a length for a timed event', () => {
    const noTime = create(); delete noTime.startTime;
    expect(field(noTime)).toBe('startTime');
    const noLength = create(); delete noLength.durationMin;
    expect(field(noLength)).toBe('durationMin');
  });

  it.each([['24:00'], ['9:30'], ['10:60'], ['ten']])('refuses the start time %s', time => {
    expect(field(create({ startTime: time }))).toBe('startTime');
  });

  it('holds the length to 1 to 1,440 minutes', () => {
    expect(field(create({ durationMin: 0 }))).toBe('durationMin');
    expect(field(create({ durationMin: 1441 }))).toBe('durationMin');
    expect(field(create({ durationMin: 1440 }))).toBeUndefined();
    expect(field(create({ durationMin: 1.5 }))).toBe('durationMin');
  });

  it('refuses a time on an all-day event, and accepts a span up to 31 days', () => {
    expect(field(create({ allDay: true }))).toBe('startTime');
    const allDay = { allDay: true, startTime: undefined, durationMin: undefined };
    expect(field(create({ ...allDay, endOn: '2026-03-02' }))).toBeUndefined();
    expect(field(create({ ...allDay, endOn: '2026-04-01' }))).toBeUndefined();
    expect(field(create({ ...allDay, endOn: '2026-04-02' }))).toBe('endOn');
    expect(field(create({ ...allDay, endOn: '2026-03-01' }))).toBe('endOn');
  });

  it('refuses an end date on a timed event', () => {
    expect(field(create({ endOn: '2026-03-03' }))).toBe('endOn');
  });

  it('refuses a repeat counted from completion', () => {
    expect(field(create({ repeat: { type: 'after', days: 3 } }))).toBe('repeat.type');
  });

  it('needs the repeat start to equal the event start', () => {
    const rule = { type: 'fixed', every: 1, unit: 'week', startOn: '2026-03-02' };
    expect(field(create({ repeat: rule }))).toBeUndefined();
    expect(field(create({ repeat: { ...rule, startOn: '2026-03-09' } }))).toBe('repeat.startOn');
  });

  it('refuses a repeat end before the start, and one on an event that does not repeat', () => {
    const rule = { type: 'fixed', every: 1, unit: 'day', startOn: '2026-03-02' };
    expect(field(create({ repeat: rule, repeatEndsOn: '2026-03-01' }))).toBe('repeatEndsOn');
    expect(field(create({ repeat: rule, repeatEndsOn: '2026-04-01' }))).toBeUndefined();
    expect(field(create({ repeatEndsOn: '2026-04-01' }))).toBe('repeatEndsOn');
  });

  it('keeps up to 50 distinct real skip dates', () => {
    const rule = { type: 'fixed', every: 1, unit: 'day', startOn: '2026-03-02' };
    const dates = (count: number): string[] => Array.from({ length: count }, (_, i) => new Date(Date.UTC(2026, 3, 1 + i)).toISOString().slice(0, 10));
    expect(field(create({ repeat: rule, skipOn: dates(50) }))).toBeUndefined();
    expect(field(create({ repeat: rule, skipOn: dates(51) }))).toBe('skipOn');
    expect(field(create({ repeat: rule, skipOn: ['2026-04-01', '2026-04-01'] }))).toBe('skipOn');
    expect(field(create({ repeat: rule, skipOn: ['2026-02-30'] }))).toBe('skipOn');
  });

  it('refuses a repeat inside every unit bound the chore form has (every 53)', () => {
    expect(field(create({ repeat: { type: 'fixed', every: 53, unit: 'day', startOn: '2026-03-02' } }))).toBe('repeat.every');
  });
});

describe('parseEventPut: edit', () => {
  it('takes one group on its own', () => {
    expect(parseEventPut({ mutationId: ID, title: 'Hygienist', titleAt: AT })).toEqual({ ok: true, value: { mutationId: ID, title: { value: 'Hygienist', at: AT } } });
  });

  it('takes a whole schedule group with its time', () => {
    const parsed = parseEventPut({ mutationId: ID, ...SCHEDULE, startTime: '11:00', scheduleAt: AT });
    expect(parsed.ok && parsed.value.schedule?.value.startTime).toBe('11:00');
  });

  it('needs scheduleAt with the schedule, and no schedule with its time alone', () => {
    expect(field({ mutationId: ID, ...SCHEDULE })).toBe('scheduleAt');
    expect(field({ mutationId: ID, scheduleAt: AT })).toBe('startOn');
  });

  it('refuses a stamp from before the app existed', () => {
    expect(field({ mutationId: ID, title: 'A', titleAt: 5 })).toBe('titleAt');
  });

  it('takes people on their own', () => {
    expect(parseEventPut({ mutationId: ID, who: 'auth0|u2', private: true, peopleAt: AT })).toMatchObject({ ok: true, value: { people: { value: { who: 'auth0|u2', private: true } } } });
  });
});

describe('parseEventDelete and parseRemindersPut', () => {
  it('needs a mutation id and nothing else for a delete', () => {
    expect(parseEventDelete({ mutationId: ID }).ok).toBe(true);
    expect(parseEventDelete({}).ok).toBe(false);
    expect(parseEventDelete({ mutationId: ID, title: 'x' }).ok).toBe(false);
  });

  it('reads a list of reminders', () => {
    const parsed = parseRemindersPut({ mutationId: ID, list: [{ from: 'start', minutes: 30 }, { from: 'end', minutes: 0 }] });
    expect(parsed).toEqual({ ok: true, value: { mutationId: ID, list: [{ from: 'start', minutes: 30 }, { from: 'end', minutes: 0 }] } });
  });

  it('accepts an empty list (no reminders) and refuses a missing one', () => {
    expect(parseRemindersPut({ mutationId: ID, list: [] }).ok).toBe(true);
    expect(parseRemindersPut({ mutationId: ID })).toEqual({ ok: false, field: 'list' });
  });

  it('refuses minutes outside 0 to 1,440, a start of the wrong kind, and a repeated reminder', () => {
    expect(parseRemindersPut({ mutationId: ID, list: [{ from: 'start', minutes: 1441 }] }).ok).toBe(false);
    expect(parseRemindersPut({ mutationId: ID, list: [{ from: 'start', minutes: -1 }] }).ok).toBe(false);
    expect(parseRemindersPut({ mutationId: ID, list: [{ from: 'middle', minutes: 5 }] }).ok).toBe(false);
    expect(parseRemindersPut({ mutationId: ID, list: [{ from: 'end', minutes: 5 }] }).ok).toBe(false);
    expect(parseRemindersPut({ mutationId: ID, list: [{ from: 'start', minutes: 5 }, { from: 'start', minutes: 5 }] }).ok).toBe(false);
  });

  it('leaves the count limit of 3 to the server, but caps the list structurally', () => {
    const many = (count: number) => Array.from({ length: count }, (_, i) => ({ from: 'start', minutes: i }));
    expect(parseRemindersPut({ mutationId: ID, list: many(4) }).ok).toBe(true);
    expect(parseRemindersPut({ mutationId: ID, list: many(21) }).ok).toBe(false);
  });

  it('refuses unknown keys', () => {
    expect(parseRemindersPut({ mutationId: ID, list: [], extra: 1 })).toEqual({ ok: false, field: 'extra' });
  });
});

describe('parseRestoreBody with events', () => {
  it('reads an event entry with the deletion time seen', () => {
    expect(parseRestoreBody({ mutationId: ID, entries: [{ kind: 'event', id: ID, deletedAt: 5 }] })).toEqual({ ok: true, value: { mutationId: ID, entries: [{ kind: 'event', id: ID, deletedAt: 5 }] } });
  });

  it('needs the deletion time for an event', () => {
    expect(parseRestoreBody({ mutationId: ID, entries: [{ kind: 'event', id: ID }] }).ok).toBe(false);
  });
});
