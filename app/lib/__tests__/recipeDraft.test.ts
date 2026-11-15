import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_FIELDS } from '../recipeFields';
import { markRefused, readDraft, removeDraft, saveDraft } from '../recipeDraft';

const ME = 'auth0|a';
const THEM = 'auth0|b';
const draft = (title: string, recipeId = 'r1') => ({ recipeId, base: EMPTY_FIELDS, fields: { ...EMPTY_FIELDS, title } });

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('recipe drafts', () => {
  it('survive a remount: a saved draft reads back', () => {
    saveDraft(ME, 'r1', draft('Chil'));
    expect(readDraft(ME, 'r1')).toEqual(draft('Chil'));
  });

  it('are removed only by removeDraft', () => {
    saveDraft(ME, 'r1', draft('Chil'));
    saveDraft(ME, 'r1', draft('Chilli'));
    expect(readDraft(ME, 'r1')?.fields.title).toBe('Chilli');
    removeDraft(ME, 'r1');
    expect(readDraft(ME, 'r1')).toBeUndefined();
  });

  it('keep a refused save, with the cause', () => {
    saveDraft(ME, 'r1', draft('Chilli'));
    markRefused(ME, 'r1', 'This household has reached 200 recipes.');
    expect(readDraft(ME, 'r1')).toMatchObject({ fields: { title: 'Chilli' }, refused: 'This household has reached 200 recipes.' });
  });

  it('are separate for each person on the device', () => {
    saveDraft(ME, 'r1', draft('Mine'));
    saveDraft(THEM, 'r1', draft('Theirs'));
    expect(readDraft(ME, 'r1')?.fields.title).toBe('Mine');
    removeDraft(THEM, 'r1');
    expect(readDraft(ME, 'r1')?.fields.title).toBe('Mine');
  });

  it('keep a new recipe under the fixed key "new", holding the id the editor made', () => {
    saveDraft(ME, 'new', draft('Soup', 'made-id'));
    expect(readDraft(ME, 'new')?.recipeId).toBe('made-id');
  });

  it('find a new recipe\'s draft when a refusal names the recipe by its id, and remove it under either key', () => {
    saveDraft(ME, 'new', draft('Soup', 'made-id'));
    markRefused(ME, 'made-id', 'Nope');
    expect(readDraft(ME, 'new')?.refused).toBe('Nope');
    removeDraft(ME, 'new');
    expect(readDraft(ME, 'new')).toBeUndefined();
  });

  it('do nothing when marking a refusal with no draft', () => {
    markRefused(ME, 'missing', 'Nope');
    expect(readDraft(ME, 'missing')).toBeUndefined();
  });

  it('do not break saving when storage throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => saveDraft(ME, 'r1', draft('x'))).not.toThrow();
    expect(readDraft(ME, 'r1')).toBeUndefined();
    expect(() => removeDraft(ME, 'r1')).not.toThrow();
    expect(() => markRefused(ME, 'r1', 'x')).not.toThrow();
  });

  it('read as nothing when the stored value is not a draft object', () => {
    window.localStorage.setItem(`hearthwise.recipeDraft.${ME}`, '{not json');
    expect(readDraft(ME, 'r1')).toBeUndefined();
    window.localStorage.setItem(`hearthwise.recipeDraft.${ME}`, '[1,2]');
    expect(readDraft(ME, 'r1')).toBeUndefined();
  });
});
