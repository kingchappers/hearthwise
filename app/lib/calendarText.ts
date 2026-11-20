import type { FeedView } from '../../src/calendar/types';
import type { Repeat } from '../../src/shared/schedule';
import type { TimelineItem } from '../../src/shared/timeline';
import { formatDay, repeatLabel } from './taskText';

// The words the calendar screens use. Neutral by rule (docs/brand.md): who is where is said in words, never by colour, and nothing here
// assigns blame.
const FAILURES: Record<string, string> = {
  private: 'Not saved: this event is now private.',
  event_limit: 'This household has reached 500 events.',
  reminder_limit: 'That is the most reminders we can add.',
  entry_changed: 'That event changed. Please look at it again.',
};

// What to tell the person when the server refused an event write with this code, or undefined for a code with no words of its own.
export const calendarFailureText = (code: string): string | undefined => FAILURES[code];

export const NOT_SAVED = 'Not saved yet';
export const NOTHING_MORE = 'Nothing more today';

const NEXT_DAY = ' (next day)';

export function timeRange(item: Pick<TimelineItem, 'allDay' | 'startTime' | 'endTime' | 'endsNextDay'>): string {
  if (item.allDay || item.startTime === undefined || item.endTime === undefined) return 'All day';
  return `${item.startTime} to ${item.endTime}${item.endsNextDay ? NEXT_DAY : ''}`;
}

export function nowText(item: TimelineItem | undefined): string {
  if (!item) return 'Now: nothing on';
  return `Now: ${item.label}, until ${item.endTime}${item.endsNextDay ? NEXT_DAY : ''}`;
}

// The other person's items are named; the viewer's own and shared ones are not, because "Both" and "Sam" say nothing new to Sam.
export function nextText(item: TimelineItem | undefined): string {
  if (!item) return NOTHING_MORE;
  return `Next: ${item.label}${item.forViewer ? '' : `, ${item.who},`} at ${item.startTime}`;
}

// The one source of this text: the add sheet and the feed form use it.
export const privateText = (otherName: string): string => `Only you can see the details. ${otherName} sees that you are busy.`;

export const zoneNote = (zone: string): string => `Times are shown in ${zone}`;

export const dayHeading = (day: string, today: string): string => (day === today ? `Today, ${formatDay(day)}` : formatDay(day));

// How an event repeats, or nothing for one that does not.
export function repeatText(repeat: Repeat, endsOn?: string): string | undefined {
  if (repeat.type === 'none') return undefined;
  const label = repeatLabel(repeat);
  return endsOn === undefined ? label : `${label}, until ${formatDay(endsOn)}`;
}

export const unsavedChanges = (count: number): string => `${count} ${count === 1 ? 'change' : 'changes'} not saved yet`;

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

// "just now", "5 minutes ago", "3 hours ago" or "2 days ago": one pattern for every state. A time ahead of the clock reads as now.
export function ageText(then: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${plural(minutes, 'minute', 'minutes')} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, 'hour', 'hours')} ago`;
  return `${plural(Math.floor(hours / 24), 'day', 'days')} ago`;
}

// The provider's name from a host, or undefined for one we do not know or one the viewer is not allowed to see.
export function providerName(host: string | undefined): string | undefined {
  if (host === undefined) return undefined;
  if (host === 'calendar.google.com') return 'Google';
  if (host === 'outlook.office365.com' || host === 'outlook.office.com' || host === 'outlook.live.com') return 'Outlook';
  if (/^p\d+-caldav\.icloud\.com$/.test(host)) return 'Apple';
  if (host === 'calendar.proton.me') return 'Proton';
  return undefined;
}

const FEED_FAILURES: Record<string, string> = {
  not_supported: 'We can read links from Google, Outlook, Apple and Proton calendars.',
  bad_link: 'That does not look like a link. Copy the whole address from the calendar\'s sharing settings.',
  unreachable: 'We could not read that link. Check that you copied the whole address from the calendar\'s sharing settings.',
  not_calendar: 'That address did not give us a calendar.',
  too_big: 'That calendar is too big for us to read.',
  not_https: 'We need a link that starts with https:// or webcal://.',
  link_stopped: 'The link stopped working. You may need a new one from the calendar\'s settings.',
  provider_busy: 'The calendar did not answer. We will try again soon.',
  link_needed: 'Link needs to be added again',
  slow_down: 'Try again later',
  feed_limit: 'That is the most calendars we can add',
  calendar_key_missing: 'Calendars are not set up on this server',
  not_owner: 'Only the person who added this calendar can change it.',
};

const FEED_FALLBACK = 'We could not do that. Please try again.';

// What to tell the person about a feed status or a refusal code. A code with no words of its own is never repeated back.
export const feedFailureText = (code: string): string => FEED_FAILURES[code] ?? FEED_FALLBACK;

function statusSentence(feed: FeedView): string {
  const provider = feed.mine ? providerName(feed.host) : undefined;
  if (feed.status === 'link_stopped') {
    if (!feed.mine) return `The link stopped working. ${feed.owner} may need a new one.`;
    return provider === undefined ? feedFailureText('link_stopped') : `The link stopped working. You may need a new one from ${provider}.`;
  }
  if (feed.status === 'provider_busy') {
    return provider === undefined ? feedFailureText('provider_busy') : `${provider} did not answer. We will try again soon.`;
  }
  return feedFailureText(feed.status);
}

// The line under a feed: when it was last read, and for one that is not fine, what happened in kind words.
export function feedUpdatedText(feed: FeedView, now: number): string {
  const when = feed.fetchedAt === undefined ? undefined : ageText(feed.fetchedAt, now);
  if (feed.status === 'ok') return when === undefined ? 'Not updated yet' : `Updated ${when}`;
  const lead = when === undefined ? 'Not updated yet' : `Last updated ${when}`;
  return `${lead}. ${statusSentence(feed)}`;
}

// What was left out of a feed. Only its owner has the counts.
export function feedNotes(feed: FeedView): string[] {
  if (!feed.mine) return [];
  const notes: string[] = [];
  if (feed.skippedCount) notes.push(`${feed.skippedCount} ${feed.skippedCount === 1 ? 'event repeats' : 'events repeat'} too often to show`);
  if (feed.truncated) notes.push('Showing the nearest 2,000');
  if (feed.approxCount) notes.push(`${plural(feed.approxCount, 'event', 'events')}: Time may be an hour out`);
  return notes;
}

export const SLOW_PROVIDER = 'Google can take many hours to show changes on its links.';

export const PROVIDER_STEPS: ReadonlyArray<{ name: string; steps: string }> = [
  { name: 'Google', steps: 'In Google Calendar: Settings, your calendar, Integrate calendar, Secret address in iCal format.' },
  { name: 'Outlook', steps: 'In Outlook on the web: Settings, Calendar, Shared calendars, Publish a calendar, then copy the ICS link.' },
  { name: 'Apple', steps: 'In Apple Calendar: open the calendar\'s info, turn on Public Calendar, then copy the link.' },
  { name: 'Proton', steps: 'In Proton Calendar: the calendar\'s options, Share, Share via link, then copy the link.' },
];
