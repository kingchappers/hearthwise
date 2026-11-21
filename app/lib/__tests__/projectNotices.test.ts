import { beforeEach, describe, expect, it } from 'vitest';
import { clearDeviceKeys, projectNoticesKey } from '../deviceKeys';
import { addNotice, dismissNotice, MAX_NOTICES, readNotices } from '../projectNotices';

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
