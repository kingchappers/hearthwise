import { describe, expect, it } from 'vitest';
import type { EventView } from '../../../src/calendar/types';
import { MAX_NOTES, MAX_PLACE, MAX_TITLE } from '../../../src/shared/calendarValidation';
import { parseEventPut } from '../../../src/shared/calendarValidation';
import { blankForm, changesFrom, evaluateForm, formFromEvent } from '../calendarForm';

const SAM = 'u-sam';
const ALEX = 'u-alex';
const AT = Date.now();
const NONE = { type: 'none' as const };

const event = (over: Partial<EventView> = {}): EventView => ({
  id: 'e1', kind: 'event', title: 'Dentist', who: 'both', private: false, startOn: '2026-11-19', allDay: false, startTime: '10:30', durationMin: 45, repeat: NONE, skipOn: [],
  reminders: {}, fieldTimes: {}, createdBy: SAM, createdAt: 1, updatedAt: 1, updatedBy: SAM, ...over,
});

describe('blankForm', () => {
  it('starts as an event for both of you, a timed hour on the day, not private, not repeating', () => {
    expect(blankForm('2026-11-16')).toMatchObject({ kind: 'event', who: 'both', private: false, startOn: '2026-11-16', allDay: false, startTime: '09:00', durationMin: '60', repeat: NONE });
  });
});

describe('evaluateForm', () => {
  const form = (over = {}) => ({ ...blankForm('2026-11-16'), title: 'Walk', ...over });

  it('turns a timed form into the schedule and people groups the server takes', () => {
    const result = evaluateForm(form({ startTime: '21:30', durationMin: '30' }), SAM);
    expect(result.valid).toBe(true);
    expect(result.schedule).toEqual({ startOn: '2026-11-16', allDay: false, startTime: '21:30', durationMin: 30, repeat: NONE, skipOn: [] });
    expect(result.people).toEqual({ who: 'both', private: false });
    expect(result.title).toBe('Walk');
  });

  it('makes every valid form one the server\'s own validator accepts', () => {
    const cases = [
      form(), form({ allDay: true }), form({ allDay: true, lastDay: '2026-11-18' }), form({ private: true, who: ALEX }),
      form({ repeat: { type: 'fixed', every: 1, unit: 'week', weekdays: ['mon', 'fri'], startOn: '2026-01-01' }, repeatEndsOn: '2026-12-31', skipOn: ['2026-11-20'] }),
    ];
    for (const one of cases) {
      const result = evaluateForm(one, SAM);
      expect(result.valid).toBe(true);
      const body: Record<string, unknown> = { mutationId: '11111111-1111-4111-8111-111111111111', kind: 'event', title: result.title, titleAt: AT, ...result.schedule, scheduleAt: AT, ...result.people, peopleAt: AT };
      expect(parseEventPut(body).ok, JSON.stringify(body)).toBe(true);
    }
  });

  it('gives an all-day event no times, and an optional last day', () => {
    expect(evaluateForm(form({ allDay: true }), SAM).schedule).toEqual({ startOn: '2026-11-16', allDay: true, repeat: NONE, skipOn: [] });
    expect(evaluateForm(form({ allDay: true, lastDay: '2026-11-18' }), SAM).schedule).toMatchObject({ endOn: '2026-11-18' });
  });

  it('makes a repeat start on the event\'s own date, and carries its end date', () => {
    const repeat = { type: 'fixed' as const, every: 2, unit: 'day' as const, startOn: '2026-01-01' };
    const result = evaluateForm(form({ repeat, repeatEndsOn: '2026-12-01' }), SAM);
    expect(result.schedule).toMatchObject({ repeat: { ...repeat, startOn: '2026-11-16' }, repeatEndsOn: '2026-12-01' });
  });

  it('ignores an end date when the event does not repeat', () => {
    expect(evaluateForm(form({ repeatEndsOn: '2026-12-01' }), SAM).schedule?.repeatEndsOn).toBeUndefined();
  });

  it('holds a private event to its maker', () => {
    expect(evaluateForm(form({ private: true, who: ALEX }), SAM).people).toEqual({ who: SAM, private: true });
  });

  it('says what to fix, in kind words', () => {
    const errors = evaluateForm(form({ title: '  ', startOn: '', startTime: '', durationMin: '0' }), SAM).errors;
    expect(errors).toEqual({
      title: 'Add a title.', startOn: 'Choose a date.', startTime: 'Choose a start time.', durationMin: 'The length must be from 1 to 1,440 minutes.',
    });
    expect(evaluateForm(form({ durationMin: '1.5' }), SAM).errors.durationMin).toBeDefined();
    expect(evaluateForm(form({ allDay: true, lastDay: '2026-11-10' }), SAM).errors.lastDay).toBe('The last day must be after the first day, and within 31 days.');
    expect(evaluateForm(form({ allDay: true, lastDay: '2026-12-30' }), SAM).errors.lastDay).toBeDefined();
    const repeat = { type: 'fixed' as const, every: 1, unit: 'day' as const, startOn: '2026-11-16' };
    expect(evaluateForm(form({ repeat, repeatEndsOn: '2026-11-01' }), SAM).errors.repeatEndsOn).toBe('The repeat cannot end before it starts.');
  });

  it('uses the same limits as the server for the title, place and notes', () => {
    expect([MAX_TITLE, MAX_PLACE, MAX_NOTES]).toEqual([80, 80, 500]);
    expect(evaluateForm(form({ title: 'x'.repeat(81) }), SAM).errors.title).toBeDefined();
    expect(evaluateForm(form({ place: 'x'.repeat(81) }), SAM).errors.place).toBeDefined();
    expect(evaluateForm(form({ notes: 'x'.repeat(501) }), SAM).errors.notes).toBeDefined();
  });
});

describe('formFromEvent', () => {
  it('opens an event as it is, including its place, notes and repeat', () => {
    const repeat = { type: 'fixed' as const, every: 1, unit: 'week' as const, weekdays: ['mon' as const], startOn: '2026-11-19' };
    const form = formFromEvent(event({ kind: 'block', place: 'Home', notes: 'Tea', repeat, repeatEndsOn: '2027-01-01', skipOn: ['2026-11-26'] }));
    expect(form).toMatchObject({
      kind: 'block', title: 'Dentist', place: 'Home', notes: 'Tea', who: 'both', private: false, startOn: '2026-11-19', allDay: false, startTime: '10:30', durationMin: '45',
      repeat, repeatEndsOn: '2027-01-01', skipOn: ['2026-11-26'],
    });
  });

  it('opens an all-day event with its last day', () => {
    expect(formFromEvent(event({ allDay: true, startTime: undefined, durationMin: undefined, endOn: '2026-11-21' }))).toMatchObject({ allDay: true, lastDay: '2026-11-21' });
  });
});

describe('changesFrom', () => {
  const save = (over: object, base = event()) => changesFrom(base, evaluateForm({ ...formFromEvent(base), ...over }, SAM), SAM);

  it('is empty when nothing changed', () => {
    expect(save({})).toEqual({});
  });

  it('sends only the group that changed', () => {
    expect(save({ title: 'Dentist, Smith St' })).toEqual({ title: 'Dentist, Smith St' });
    expect(save({ startTime: '11:00' })).toMatchObject({ schedule: { startTime: '11:00', durationMin: 45 } });
    expect(Object.keys(save({ startTime: '11:00' }))).toEqual(['schedule']);
    expect(save({ who: ALEX })).toEqual({ people: { who: ALEX, private: false } });
  });

  it('sends an empty place or notes to clear it, and nothing when it was never set', () => {
    expect(save({ place: '' }, event({ place: 'Surgery' }))).toEqual({ place: '' });
    expect(save({ place: '' })).toEqual({});
  });

  it('sends nothing for a form that is not valid', () => {
    expect(save({ title: '' })).toEqual({});
  });
});
