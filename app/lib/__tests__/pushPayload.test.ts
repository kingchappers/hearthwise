import { describe, expect, it } from 'vitest';
import { parsePushPayload } from '../pushPayload';

const data = (json: () => unknown, text: () => string = () => '') => ({ json, text });

describe('parsePushPayload', () => {
  it('reads a JSON payload the server sent', () => {
    expect(parsePushPayload(data(() => ({ title: 'Sam did Hoover', body: 'Hoover is done', tag: 'notify-1', url: '/tasks/abc' }))))
      .toEqual({ title: 'Sam did Hoover', body: 'Hoover is done', tag: 'notify-1', url: '/tasks/abc' });
  });

  it('shows a plain-text push as its body instead of failing to show anything', () => {
    expect(parsePushPayload(data(() => { throw new SyntaxError('not json'); }, () => 'Hello'))).toEqual({ title: 'Hearthwise', body: 'Hello', url: '/' });
  });

  it('shows a plain notification when there is no payload at all', () => {
    expect(parsePushPayload(undefined)).toEqual({ title: 'Hearthwise', url: '/' });
  });

  it('ignores fields of the wrong type', () => {
    expect(parsePushPayload(data(() => ({ title: 5, body: { x: 1 }, tag: [], url: 7 })))).toEqual({ title: 'Hearthwise', url: '/' });
  });

  it.each(['https://evil.example/x', '//evil.example/x', 'javascript:alert(1)', 'tasks/abc'])('opens the app, not %s', url => {
    expect(parsePushPayload(data(() => ({ title: 'T', url }))).url).toBe('/');
  });
});
