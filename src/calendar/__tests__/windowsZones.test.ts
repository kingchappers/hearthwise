import { describe, expect, it } from 'vitest';
import { WINDOWS_ZONES, windowsZoneToIana } from '../windowsZones';

describe('windowsZoneToIana', () => {
  it('maps the names Outlook writes', () => {
    expect(windowsZoneToIana('W. Europe Standard Time')).toBe('Europe/Berlin');
    expect(windowsZoneToIana('GMT Standard Time')).toBe('Europe/London');
    expect(windowsZoneToIana('Eastern Standard Time')).toBe('America/New_York');
    expect(windowsZoneToIana('AUS Eastern Standard Time')).toBe('Australia/Sydney');
  });

  it('ignores case and surrounding space', () => {
    expect(windowsZoneToIana('  gmt standard time ')).toBe('Europe/London');
  });

  it('returns nothing for a name it does not know, including names on the object prototype', () => {
    expect(windowsZoneToIana('Customized Time Zone')).toBeUndefined();
    expect(windowsZoneToIana('constructor')).toBeUndefined();
    expect(windowsZoneToIana('__proto__')).toBeUndefined();
  });

  it('has about 140 names, and the runtime knows every zone they map to', () => {
    const entries = Object.entries(WINDOWS_ZONES);
    expect(entries.length).toBeGreaterThanOrEqual(130);
    for (const [, zone] of entries) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: zone }), zone).not.toThrow();
    }
  });

  it('has full time zone data for the zones the container relies on', () => {
    for (const zone of ['Europe/London', 'America/New_York', 'Australia/Sydney']) {
      expect(new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone).toBe(zone);
    }
  });
});
