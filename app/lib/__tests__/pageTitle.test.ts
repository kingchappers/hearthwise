import { describe, it, expect } from 'vitest';
import { pageTitle, APP_NAME, APP_DESCRIPTION } from '../pageTitle';

describe('pageTitle', () => {
  it('is just the app name with no parts', () => {
    expect(pageTitle()).toBe('Hearthwise');
  });

  it('joins the parts with an en dash and ends with the app name', () => {
    expect(pageTitle('Shopping', 'Milk')).toBe('Shopping – Milk – Hearthwise');
  });

  it('skips empty parts', () => {
    expect(pageTitle('Settings', '')).toBe('Settings – Hearthwise');
  });

  it('names the product Hearthwise and describes it in one calm sentence', () => {
    expect(APP_NAME).toBe('Hearthwise');
    expect(APP_DESCRIPTION).toBe('A shared household app for chores, to-dos and the shopping list.');
  });
});
