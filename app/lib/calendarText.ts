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
