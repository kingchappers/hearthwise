import { describe, expect, it } from 'vitest';
import { costLine, holderLine, onItFor, plannedText, stepsDone, stepStatus } from '../projectText';

const members = [{ userId: 'u1', displayName: 'Sam', joinedAt: '' }, { userId: 'u2', displayName: 'Alex', joinedAt: '' }];
const DAY = 86_400_000;

describe('step status', () => {
  it('is Done, On it (todo with a current holder), or Not started', () => {
    expect(stepStatus({ state: 'done' }, members)).toBe('done');
    expect(stepStatus({ state: 'todo', takenBy: 'u2' }, members)).toBe('onIt');
    expect(stepStatus({ state: 'todo' }, members)).toBe('notStarted');
  });

  it('reads a holder who has left as Not started', () => {
    expect(stepStatus({ state: 'todo', takenBy: 'gone' }, members)).toBe('notStarted');
  });
});

describe('holderLine', () => {
  it('names the other person, says "You\'re on this" for the viewer, and says nothing for a holder who has left', () => {
    expect(holderLine({ takenBy: 'u2' }, members, 'u1')).toBe('Alex is on this');
    expect(holderLine({ takenBy: 'u1' }, members, 'u1')).toBe("You're on this");
    expect(holderLine({ takenBy: 'gone' }, members, 'u1')).toBeUndefined();
    expect(holderLine({}, members, 'u1')).toBeUndefined();
  });
});

describe('onItFor', () => {
  it('says nothing for under a day, then days, then weeks, neutrally', () => {
    const now = 100 * DAY;
    expect(onItFor(now - 3_600_000, now)).toBeUndefined();
    expect(onItFor(now - DAY, now)).toBe('On it for 1 day');
    expect(onItFor(now - 5 * DAY, now)).toBe('On it for 5 days');
    expect(onItFor(now - 21 * DAY, now)).toBe('On it for 3 weeks');
    expect(onItFor(undefined, now)).toBeUndefined();
  });
});

describe('stepsDone', () => {
  it('reads "3 of 8 steps done"', () => {
    expect(stepsDone(3, 8)).toBe('3 of 8 steps done');
    expect(stepsDone(0, 1)).toBe('0 of 1 step done');
  });
});

describe('plannedText', () => {
  it('says "Planned for Saturday 5 December" for one day and "Planned for 5 to 6 December" for a span, the same on a day that has passed', () => {
    expect(plannedText({ plannedOn: '2026-12-05' })).toBe('Planned for Saturday 5 December');
    expect(plannedText({ plannedOn: '2026-12-05', plannedEndOn: null })).toBe('Planned for Saturday 5 December');
    expect(plannedText({ plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' })).toBe('Planned for 5 to 6 December');
    expect(plannedText({ plannedOn: '2026-11-03' })).toBe('Planned for Tuesday 3 November');
  });

  it('names both months for a span across two', () => {
    expect(plannedText({ plannedOn: '2026-11-29', plannedEndOn: '2026-12-02' })).toBe('Planned for 29 November to 2 December');
  });

  it('says no day for a clear', () => {
    expect(plannedText({ plannedOn: null })).toBe('No day planned');
  });
});

describe('costLine', () => {
  it('shows both figures as "of", one figure on its own, and nothing for neither', () => {
    expect(costLine({ estimatePence: 400000, spentPence: 125000 })).toBe('£1,250.00 of £4,000.00');
    expect(costLine({ estimatePence: 400000 })).toBe('Estimated £4,000.00');
    expect(costLine({ spentPence: 125000 })).toBe('£1,250.00 spent so far');
    expect(costLine({})).toBeUndefined();
  });

  it('never says a verdict, even when more is spent than estimated', () => {
    expect(costLine({ estimatePence: 100000, spentPence: 250000 })).toBe('£2,500.00 of £1,000.00');
  });
});
