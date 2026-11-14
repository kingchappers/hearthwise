import { describe, expect, it } from 'vitest';
import {
  parseDisplayName, parseHouseholdName, parseInviteToken, parseMemberPatch, parseMutationId, parseTimeZoneField,
} from '../validation';

const ok = <T>(value: T) => ({ ok: true, value });
const bad = (field: string) => ({ ok: false, field });

describe('parseDisplayName', () => {
  it('accepts 1 to 40 characters and trims them', () => {
    expect(parseDisplayName('  Sam  ')).toEqual(ok('Sam'));
    expect(parseDisplayName('x'.repeat(40))).toEqual(ok('x'.repeat(40)));
  });

  it.each([['an empty string', ''], ['only spaces', '   '], ['41 characters', 'x'.repeat(41)], ['a number', 5], ['null', null], ['undefined', undefined]])(
    'rejects %s',
    (_name, value) => expect(parseDisplayName(value)).toEqual(bad('displayName')),
  );

  it('counts an emoji as one character', () => {
    expect(parseDisplayName('🔥'.repeat(40)).ok).toBe(true);
    expect(parseDisplayName('🔥'.repeat(41)).ok).toBe(false);
  });
});

describe('parseHouseholdName', () => {
  it('accepts 1 to 60 characters', () => {
    expect(parseHouseholdName('Home')).toEqual(ok('Home'));
    expect(parseHouseholdName('x'.repeat(60)).ok).toBe(true);
  });

  it.each(['', '  ', 'x'.repeat(61), 7, null])('rejects %j', value => {
    expect(parseHouseholdName(value)).toEqual(bad('name'));
  });
});

describe('parseTimeZoneField', () => {
  it('accepts an IANA zone and rejects anything else', () => {
    expect(parseTimeZoneField('Europe/London')).toEqual(ok('Europe/London'));
    for (const value of ['Mars/Olympus', '', 5, undefined]) expect(parseTimeZoneField(value)).toEqual(bad('timezone'));
  });
});

describe('parseInviteToken', () => {
  const token = 'A'.repeat(43);

  it('accepts exactly 43 base64url characters', () => {
    expect(parseInviteToken(token)).toEqual(ok(token));
    expect(parseInviteToken('a-_9'.repeat(10) + 'abc')).toEqual(ok('a-_9'.repeat(10) + 'abc'));
  });

  it.each([
    ['42 characters', 'A'.repeat(42)],
    ['44 characters', 'A'.repeat(44)],
    ['a plus sign', 'A'.repeat(42) + '+'],
    ['padding', 'A'.repeat(42) + '='],
    ['an empty string', ''],
    ['null', null],
    ['a number', 12345],
    ['10,000 characters of text', 'A'.repeat(10_000)],
    ['a token with a newline', 'A'.repeat(42) + '\n'],
  ])('rejects %s', (_name, value) => {
    expect(parseInviteToken(value)).toEqual(bad('token'));
  });
});

describe('parseMutationId', () => {
  it('lets an absent id through as undefined', () => {
    expect(parseMutationId(undefined)).toEqual(ok(undefined));
  });

  it('accepts a UUID and rejects other text', () => {
    const id = '0190a2b4-7c3e-7f10-9a11-2b3c4d5e6f70';
    expect(parseMutationId(id)).toEqual(ok(id));
    for (const value of ['', 'abc', 5, null, `${id}x`]) expect(parseMutationId(value)).toEqual(bad('mutationId'));
  });
});

describe('parseMemberPatch', () => {
  it('accepts a display name alone, settings alone, or both', () => {
    expect(parseMemberPatch({ displayName: ' Sam ' })).toEqual(ok({ displayName: 'Sam' }));
    expect(parseMemberPatch({ settings: { defaultView: 'next' } })).toEqual(ok({ settings: { defaultView: 'next' } }));
    expect(parseMemberPatch({ displayName: 'Sam', settings: { digest: { on: true } } }).ok).toBe(true);
  });

  it('lets an optional mutationId travel with the body without making it part of the patch', () => {
    expect(parseMemberPatch({ displayName: 'Sam', mutationId: '0190a2b4-7c3e-7f10-9a11-2b3c4d5e6f70' })).toEqual(ok({ displayName: 'Sam' }));
  });

  it('rejects an empty patch', () => {
    expect(parseMemberPatch({})).toEqual(bad('body'));
    expect(parseMemberPatch({ mutationId: '0190a2b4-7c3e-7f10-9a11-2b3c4d5e6f70' })).toEqual(bad('body'));
  });

  it('rejects an unknown key, naming it', () => {
    expect(parseMemberPatch({ role: 'admin' })).toEqual(bad('role'));
    expect(parseMemberPatch({ settings: { colour: 'red' } })).toEqual(bad('settings.colour'));
    expect(parseMemberPatch({ settings: { digest: { minute: 5 } } })).toEqual(bad('settings.digest.minute'));
  });

  it.each([-1, 24, 1.5, '8', null, Number.NaN])('rejects the hour %j', hour => {
    expect(parseMemberPatch({ settings: { digest: { hour } } })).toEqual(bad('settings.digest.hour'));
    expect(parseMemberPatch({ settings: { dueNudges: { hour } } })).toEqual(bad('settings.dueNudges.hour'));
  });

  it('accepts the first and last hour of the day', () => {
    expect(parseMemberPatch({ settings: { digest: { hour: 0 } } }).ok).toBe(true);
    expect(parseMemberPatch({ settings: { dueNudges: { hour: 23 } } }).ok).toBe(true);
  });

  it('rejects a switch that is not a boolean', () => {
    expect(parseMemberPatch({ settings: { digest: { on: 'yes' } } })).toEqual(bad('settings.digest.on'));
  });

  it('accepts quiet hours as null or both ends, and rejects anything else', () => {
    expect(parseMemberPatch({ settings: { quietHours: null } })).toEqual(ok({ settings: { quietHours: null } }));
    expect(parseMemberPatch({ settings: { quietHours: { start: 22, end: 7 } } }).ok).toBe(true);
    expect(parseMemberPatch({ settings: { quietHours: { start: 22 } } })).toEqual(bad('settings.quietHours'));
    expect(parseMemberPatch({ settings: { quietHours: { start: 24, end: 7 } } })).toEqual(bad('settings.quietHours.start'));
    expect(parseMemberPatch({ settings: { quietHours: { start: 22, end: -1 } } })).toEqual(bad('settings.quietHours.end'));
  });

  it.each(['list', 'next'])('accepts the default view %s', view => {
    expect(parseMemberPatch({ settings: { defaultView: view } }).ok).toBe(true);
  });

  it('rejects an unknown default view', () => {
    expect(parseMemberPatch({ settings: { defaultView: 'grid' } })).toEqual(bad('settings.defaultView'));
  });

  it('rejects a settings value that is not an object', () => {
    expect(parseMemberPatch({ settings: 'dark' })).toEqual(bad('settings'));
    expect(parseMemberPatch({ settings: [] })).toEqual(bad('settings'));
  });

  it('applies the display name rule to the patch', () => {
    expect(parseMemberPatch({ displayName: '' })).toEqual(bad('displayName'));
  });
});
