import { beforeEach, describe, expect, it } from 'vitest';
import { clearDeviceKeys, projectNoticesKey } from '../deviceKeys';
import { addNotice, detectReplaced, dismissNotice, MAX_NOTICES, readNotices, rememberSaved } from '../projectNotices';

const base = { kind: 'replaced' as const, projectId: 'p1', recordId: 's1', field: 'text', text: 'My words', at: 1 };
beforeEach(() => window.localStorage.clear());

describe('project notices', () => {
  it('keeps a person\'s words until they dismiss them, across a reload', () => {
    addNotice('u1', base);
    const stored = readNotices('u1');
    expect(stored).toHaveLength(1);
    expect(stored[0].text).toBe('My words');
    dismissNotice('u1', stored[0].id);
    expect(readNotices('u1')).toEqual([]);
  });

  it('is cleared at sign-out, and a second person on the same phone never sees the first\'s', () => {
    addNotice('u1', base);
    expect(readNotices('u2')).toEqual([]);
    clearDeviceKeys('u1');
    expect(window.localStorage.getItem(projectNoticesKey('u1'))).toBeNull();
  });

  it('keeps one for each record and field, the newest', () => {
    addNotice('u1', base);
    addNotice('u1', { ...base, text: 'Newer words', at: 2 });
    addNotice('u1', { ...base, field: 'note', text: 'A note' });
    expect(readNotices('u1').map(notice => notice.text)).toEqual(['Newer words', 'A note']);
  });

  it('keeps at most 50, dropping the oldest', () => {
    for (let i = 0; i < MAX_NOTICES + 5; i += 1) addNotice('u1', { ...base, recordId: `s${i}`, at: i });
    const notices = readNotices('u1');
    expect(notices).toHaveLength(MAX_NOTICES);
    expect(notices[0].recordId).toBe('s5');
  });

  it('reads blocked or broken storage as no notices', () => {
    window.localStorage.setItem(projectNoticesKey('u1'), '{not json');
    expect(readNotices('u1')).toEqual([]);
  });
});

describe('words replaced by the other person after they were saved', () => {
  const step = (over: object = {}) => ({ id: 's1', fieldTimes: { text: 1000 }, updatedBy: 'u1', values: { text: 'Sam wording', note: '' }, ...over });

  it('says nothing while the server still holds what this person saved, and keeps watching', () => {
    rememberSaved('u1', 's1', 'text', 'Sam wording', 1000);
    detectReplaced('u1', 'p1', [step()], 2000);
    expect(readNotices('u1')).toEqual([]);
    // The other person's newer edit arrives later and is still caught.
    detectReplaced('u1', 'p1', [step({ fieldTimes: { text: 3000 }, updatedBy: 'u2', values: { text: 'Alex wording', note: '' } })], 4000);
    expect(readNotices('u1')).toHaveLength(1);
  });

  it('keeps this person\'s own words when a newer edit by the other person replaced them, once', () => {
    rememberSaved('u1', 's1', 'text', 'Sam wording', 1000);
    const replaced = step({ fieldTimes: { text: 3000 }, updatedBy: 'u2', values: { text: 'Alex wording', note: '' } });
    detectReplaced('u1', 'p1', [replaced], 4000);
    expect(readNotices('u1')[0]).toMatchObject({ kind: 'replaced', projectId: 'p1', recordId: 's1', field: 'text', text: 'Sam wording' });
    detectReplaced('u1', 'p1', [replaced], 5000);
    expect(readNotices('u1')).toHaveLength(1);
  });

  it('says nothing when the other person wrote the same words, or when the change was this person\'s own, from another phone', () => {
    rememberSaved('u1', 's1', 'text', 'Sam wording', 1000);
    detectReplaced('u1', 'p1', [step({ fieldTimes: { text: 3000 }, updatedBy: 'u2' })], 4000);
    expect(readNotices('u1')).toEqual([]);
    rememberSaved('u1', 's2', 'text', 'Mine', 1000);
    detectReplaced('u1', 'p1', [step({ id: 's2', fieldTimes: { text: 3000 }, updatedBy: 'u1', values: { text: 'Mine, changed', note: '' } })], 4000);
    expect(readNotices('u1')).toEqual([]);
  });

  it('is kept for this person only, and forgets an entry after a week', () => {
    rememberSaved('u1', 's1', 'text', 'Sam wording', 1000);
    const replaced = step({ fieldTimes: { text: 3000 }, updatedBy: 'u2', values: { text: 'Alex wording', note: '' } });
    detectReplaced('u2', 'p1', [replaced], 4000);
    expect(readNotices('u2')).toEqual([]);
    detectReplaced('u1', 'p1', [step()], 1000 + 8 * 86_400_000);
    detectReplaced('u1', 'p1', [replaced], 1000 + 8 * 86_400_000 + 1);
    expect(readNotices('u1')).toEqual([]);
  });

  it('watches a note as well as the words of a step, and empty counts as empty', () => {
    rememberSaved('u1', 's1', 'note', 'Use the long bar', 1000);
    detectReplaced('u1', 'p1', [step({ fieldTimes: { note: 3000 }, updatedBy: 'u2', values: { text: 'x', note: '' } })], 4000);
    expect(readNotices('u1')[0]).toMatchObject({ field: 'note', text: 'Use the long bar' });
  });
});
