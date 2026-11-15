import { describe, expect, it } from 'vitest';
import { cookLink, dayHeading, weekLabel } from '../planText';

describe('dayHeading', () => {
  it('is the short weekday, the day and the short month', () => {
    expect(dayHeading('2026-11-16')).toBe('Mon 16 Nov');
    expect(dayHeading('2027-01-01')).toBe('Fri 1 Jan');
  });
});

describe('weekLabel', () => {
  it('calls the first two weeks This week and Next week, and names the rest by their Monday', () => {
    expect(weekLabel(0, '2026-11-16')).toBe('This week');
    expect(weekLabel(1, '2026-11-23')).toBe('Next week');
    expect(weekLabel(2, '2026-11-30')).toBe('Week of 30 Nov');
    expect(weekLabel(4, '2026-12-14')).toBe('Week of 14 Dec');
  });
});

describe('cookLink', () => {
  it('opens the cooking view, carrying the planned servings and the day it came from', () => {
    expect(cookLink('r1', 4, '2026-11-16')).toBe('/recipes/r1?servings=4&day=2026-11-16');
  });

  it('leaves out what it was not given', () => {
    expect(cookLink('r1')).toBe('/recipes/r1');
    expect(cookLink('r1', 3)).toBe('/recipes/r1?servings=3');
  });
});
