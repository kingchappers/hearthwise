// Types and defaults shared by the API and the app. Hours are whole hours, in the household's time zone.
export interface HourSetting {
  on: boolean;
  hour: number;
}

export interface MemberSettings {
  digest: HourSetting;
  dueNudges: HourSetting;
  // `start` greater than `end` runs past midnight (22 to 7). Null means no quiet hours.
  quietHours: { start: number; end: number } | null;
  defaultView: 'list' | 'next';
}

// What a PATCH may change: each nested setting is partial, so changing the digest hour keeps its on/off switch.
export interface MemberSettingsPatch {
  digest?: Partial<HourSetting>;
  dueNudges?: Partial<HourSetting>;
  quietHours?: { start: number; end: number } | null;
  defaultView?: 'list' | 'next';
}

// Every reminder is off until the person turns it on.
export const DEFAULT_SETTINGS: MemberSettings = {
  digest: { on: false, hour: 19 },
  dueNudges: { on: false, hour: 8 },
  quietHours: null,
  defaultView: 'list',
};
