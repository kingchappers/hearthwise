export interface DeliverySettings {
  // Hours are 0 to 23 in the device's own time zone.
  hour: number;
  quietStart: number | null;
  quietEnd: number | null;
  timeZone: string;
}

export interface LocalMoment {
  date: string;
  hour: number;
}

// The date and hour it is right now in a person's own time zone.
export function localMoment(now: Date, timeZone: string): LocalMoment {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string): string => parts.find(item => item.type === type)?.value ?? '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, hour: Number(part('hour')) };
}

// Quiet hours may run past midnight (22 to 7). The same start and end means none.
export function isQuietHour(hour: number, quietStart: number | null, quietEnd: number | null): boolean {
  if (quietStart === null || quietEnd === null || quietStart === quietEnd) return false;
  return quietStart < quietEnd ? hour >= quietStart && hour < quietEnd : hour >= quietStart || hour < quietEnd;
}

// A reminder chosen for a quiet hour waits until the quiet hours end.
export function sendHour({ hour, quietStart, quietEnd }: DeliverySettings): number {
  return isQuietHour(hour, quietStart, quietEnd) && quietEnd !== null ? quietEnd : hour;
}
