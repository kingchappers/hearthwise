import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '../../../src/shared/timeline';
import {
  ageText, calendarFailureText, dayHeading, feedFailureText, feedNotes, feedUpdatedText, nextText, NOT_SAVED, nowText, NOTHING_MORE, privateText, providerName, PROVIDER_STEPS, repeatText, SLOW_PROVIDER,
  timeRange, zoneNote,
} from '../calendarText';
import type { FeedView } from '../../../src/calendar/types';

const item = (over: Partial<TimelineItem> = {}): TimelineItem => ({
  key: 'k', type: 'event', label: 'Dentist', who: 'Alex', forViewer: false, allDay: false, on: '2026-11-19', startTime: '10:30', endOn: '2026-11-19', endTime: '11:15', endsNextDay: false, ...over,
});

describe('timeRange', () => {
  it('reads a start to an end, and says when the end is on the next day', () => {
    expect(timeRange(item())).toBe('10:30 to 11:15');
    expect(timeRange(item({ startTime: '23:00', endTime: '07:00', endOn: '2026-11-20', endsNextDay: true }))).toBe('23:00 to 07:00 (next day)');
  });

  it('says All day for an item with no times', () => {
    expect(timeRange(item({ allDay: true, startTime: undefined, endTime: undefined }))).toBe('All day');
  });
});

describe('nowText and nextText', () => {
  it('says what is on and until when, or that nothing is', () => {
    expect(nowText(item({ label: 'Wind down', startTime: '21:30', endTime: '22:00' }))).toBe('Now: Wind down, until 22:00');
    expect(nowText(item({ label: 'Sleep', endTime: '07:00', endsNextDay: true }))).toBe('Now: Sleep, until 07:00 (next day)');
    expect(nowText(undefined)).toBe('Now: nothing on');
  });

  it('says what is next and when, naming the other person but not the viewer or both', () => {
    expect(nextText(item({ label: 'Wind down', who: 'Sam', forViewer: true, startTime: '21:30' }))).toBe('Next: Wind down at 21:30');
    expect(nextText(item({ label: 'Walk', who: 'Both', forViewer: true, startTime: '08:00' }))).toBe('Next: Walk at 08:00');
    expect(nextText(item())).toBe('Next: Dentist, Alex, at 10:30');
    expect(nextText(item({ label: 'Busy', who: 'Alex', type: 'busy' }))).toBe('Next: Busy, Alex, at 10:30');
    expect(nextText(undefined)).toBe(NOTHING_MORE);
    expect(NOTHING_MORE).toBe('Nothing more today');
  });
});

describe('the one-line words', () => {
  it('names the private rule once, with the other person\'s name', () => {
    expect(privateText('Alex')).toBe('Only you can see the details. Alex sees that you are busy.');
  });

  it('says Not saved yet', () => {
    expect(NOT_SAVED).toBe('Not saved yet');
  });

  it('says which zone the times are shown in', () => {
    expect(zoneNote('Europe/London')).toBe('Times are shown in Europe/London');
  });

  it('heads a day with its name, and says Today for today', () => {
    expect(dayHeading('2026-11-16', '2026-11-16')).toBe('Today, Mon 16 Nov');
    expect(dayHeading('2026-11-17', '2026-11-16')).toBe('Tue 17 Nov');
  });

  it('says how an event repeats, and when it ends', () => {
    expect(repeatText({ type: 'none' })).toBeUndefined();
    expect(repeatText({ type: 'fixed', every: 1, unit: 'week', weekdays: ['mon', 'fri'], startOn: '2026-11-16' })).toBe('Every week on Mon, Fri');
    expect(repeatText({ type: 'fixed', every: 1, unit: 'day', startOn: '2026-11-16' }, '2026-12-31')).toBe('Every day, until Thu 31 Dec');
  });

  it('keeps the failure words the registry uses', () => {
    expect(calendarFailureText('private')).toBe('Not saved: this event is now private.');
    expect(calendarFailureText('something_else')).toBeUndefined();
  });
});

describe('ageText', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  const ago = (ms: number): string => ageText(now - ms, now);
  it('says just now under a minute, then minutes, hours and days, with one pattern', () => {
    expect(ago(0)).toBe('just now');
    expect(ago(59_000)).toBe('just now');
    expect(ago(60_000)).toBe('1 minute ago');
    expect(ago(5 * 60_000)).toBe('5 minutes ago');
    expect(ago(59 * 60_000)).toBe('59 minutes ago');
    expect(ago(3_600_000)).toBe('1 hour ago');
    expect(ago(3 * 3_600_000)).toBe('3 hours ago');
    expect(ago(23 * 3_600_000)).toBe('23 hours ago');
    expect(ago(47 * 3_600_000)).toBe('1 day ago');
    expect(ago(2 * 86_400_000)).toBe('2 days ago');
  });

  it('never says a time in the future, whatever the clocks disagree about', () => {
    expect(ageText(now + 5 * 60_000, now)).toBe('just now');
  });
});

describe('feedUpdatedText', () => {
  const now = Date.parse('2026-11-16T12:00:00Z');
  const feed = (over: Partial<FeedView> = {}): FeedView => ({ id: 'f', label: 'Work', owner: 'Sam', mine: true, share: 'busy', status: 'ok', fetchedAt: now - 5 * 60_000, host: 'calendar.google.com', ...over });

  it('says Updated and the age for a feed that is fine', () => {
    expect(feedUpdatedText(feed(), now)).toBe('Updated 5 minutes ago');
    expect(feedUpdatedText(feed({ fetchedAt: now }), now)).toBe('Updated just now');
  });

  it('says Last updated, then what happened in kind words, for a feed that is not fine', () => {
    expect(feedUpdatedText(feed({ status: 'link_stopped', host: 'outlook.office365.com', fetchedAt: now - 2 * 86_400_000 }), now))
      .toBe('Last updated 2 days ago. The link stopped working. You may need a new one from Outlook.');
    expect(feedUpdatedText(feed({ status: 'provider_busy', fetchedAt: now - 3_600_000 }), now)).toBe('Last updated 1 hour ago. Google did not answer. We will try again soon.');
    expect(feedUpdatedText(feed({ status: 'not_calendar' }), now)).toBe('Last updated 5 minutes ago. That address did not give us a calendar.');
    expect(feedUpdatedText(feed({ status: 'unreachable' }), now)).toBe('Last updated 5 minutes ago. We could not read that link. Check that you copied the whole address from the calendar\'s sharing settings.');
    expect(feedUpdatedText(feed({ status: 'too_big' }), now)).toBe('Last updated 5 minutes ago. That calendar is too big for us to read.');
  });

  it('says the link needs to be added again when the stored one cannot be read', () => {
    expect(feedUpdatedText(feed({ status: 'link_needed' }), now)).toBe('Last updated 5 minutes ago. Link needs to be added again');
  });

  it('does not name a provider the other person cannot know (they never see the host)', () => {
    expect(feedUpdatedText(feed({ mine: false, owner: 'Sam', host: undefined, status: 'link_stopped' }), now)).toBe('Last updated 5 minutes ago. The link stopped working. Sam may need a new one.');
    expect(feedUpdatedText(feed({ mine: false, host: undefined, status: 'provider_busy' }), now)).toBe('Last updated 5 minutes ago. The calendar did not answer. We will try again soon.');
  });

  it('says a link was never read when there is no time', () => {
    expect(feedUpdatedText(feed({ fetchedAt: undefined }), now)).toBe('Not updated yet');
  });

  it('uses no red, shaming or alarm words', () => {
    for (const status of ['not_https', 'bad_link', 'not_supported', 'unreachable', 'link_stopped', 'provider_busy', 'not_calendar', 'too_big', 'link_needed'] as const) {
      expect(feedUpdatedText(feed({ status }), now)).not.toMatch(/\b(failed|failure|error|alert|warning|overdue|missed|late)\b/i);
    }
  });
});

describe('providerName', () => {
  it.each([
    ['calendar.google.com', 'Google'], ['outlook.office365.com', 'Outlook'], ['outlook.office.com', 'Outlook'], ['outlook.live.com', 'Outlook'], ['p12-caldav.icloud.com', 'Apple'],
    ['calendar.proton.me', 'Proton'],
  ])('%s is %s', (host, name) => expect(providerName(host)).toBe(name));
  it('has no name for a host it does not know, or for none', () => {
    expect(providerName('cal.example.net')).toBeUndefined();
    expect(providerName(undefined)).toBeUndefined();
  });
});

describe('feedFailureText', () => {
  it('has the design\'s words for each code', () => {
    expect(feedFailureText('not_supported')).toBe('We can read links from Google, Outlook, Apple and Proton calendars.');
    expect(feedFailureText('bad_link')).toBe('That does not look like a link. Copy the whole address from the calendar\'s sharing settings.');
    expect(feedFailureText('unreachable')).toBe('We could not read that link. Check that you copied the whole address from the calendar\'s sharing settings.');
    expect(feedFailureText('not_calendar')).toBe('That address did not give us a calendar.');
    expect(feedFailureText('too_big')).toBe('That calendar is too big for us to read.');
    expect(feedFailureText('not_https')).toBe('We need a link that starts with https:// or webcal://.');
    expect(feedFailureText('link_stopped')).toBe('The link stopped working. You may need a new one from the calendar\'s settings.');
    expect(feedFailureText('provider_busy')).toBe('The calendar did not answer. We will try again soon.');
  });

  it('has words for the refusals the route gives', () => {
    expect(feedFailureText('slow_down')).toBe('Try again later');
    expect(feedFailureText('feed_limit')).toBe('That is the most calendars we can add');
    expect(feedFailureText('calendar_key_missing')).toBe('Calendars are not set up on this server');
    expect(feedFailureText('not_owner')).toBe('Only the person who added this calendar can change it.');
  });

  it('says something kind for a code it does not know, and never repeats it', () => {
    expect(feedFailureText('SENTINEL')).toBe('We could not do that. Please try again.');
  });
});

describe('feedNotes', () => {
  const feed = (over: Partial<FeedView> = {}): FeedView => ({ id: 'f', label: 'Work', owner: 'Sam', mine: true, share: 'busy', status: 'ok', ...over });
  it('says what was left out, in the design\'s words', () => {
    expect(feedNotes(feed({ skippedCount: 1 }))).toEqual(['1 event repeats too often to show']);
    expect(feedNotes(feed({ skippedCount: 3 }))).toEqual(['3 events repeat too often to show']);
    expect(feedNotes(feed({ truncated: true }))).toEqual(['Showing the nearest 2,000']);
    expect(feedNotes(feed({ approxCount: 2 }))).toEqual(['2 events: Time may be an hour out']);
    expect(feedNotes(feed({ approxCount: 1 }))).toEqual(['1 event: Time may be an hour out']);
  });
  it('has nothing to say for a clean feed, or for one the other person sees (no counts)', () => {
    expect(feedNotes(feed({ skippedCount: 0, approxCount: 0, truncated: false }))).toEqual([]);
    expect(feedNotes(feed({ mine: false }))).toEqual([]);
  });
});

describe('the slow provider note and the provider steps', () => {
  it('says Google can be slow', () => expect(SLOW_PROVIDER).toBe('Google can take many hours to show changes on its links.'));
  it('has steps for Google, Outlook, Apple and Proton', () => {
    expect(PROVIDER_STEPS.map(step => step.name)).toEqual(['Google', 'Outlook', 'Apple', 'Proton']);
    expect(PROVIDER_STEPS[0].steps).toBe('In Google Calendar: Settings, your calendar, Integrate calendar, Secret address in iCal format.');
    for (const step of PROVIDER_STEPS) expect(step.steps.length).toBeGreaterThan(20);
  });
});
