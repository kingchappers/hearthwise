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
