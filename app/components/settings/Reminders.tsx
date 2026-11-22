import { useState } from 'react';
import { NativeSelect, Stack, Switch, Text } from '@mantine/core';
import { DEFAULT_SETTINGS } from '../../../src/shared/household';
import { useHousehold, useUpdateMe } from '~/lib/household';
import { HOUR_OPTIONS, isInQuietHours } from './hours';

type Which = 'digest' | 'dueNudges' | 'plannedDay';

// Your own reminders. Each is off until you turn it on; the time is in the household's time zone.
export function Reminders() {
  const household = useHousehold();
  const update = useUpdateMe();
  const [failed, setFailed] = useState(false);
  const me = household.data?.me;
  if (!me) return null;
  // A record saved before a setting existed has no value for it: the default stands in.
  const settings = { ...DEFAULT_SETTINGS, ...me.settings };

  const save = (which: Which, change: { on?: boolean; hour?: number }): void => {
    setFailed(false);
    update.mutateAsync({ settings: { [which]: change } }).catch((error: unknown) => { console.error('Reminders: could not save', error); setFailed(true); });
  };

  const block = (which: Which, switchLabel: string, description: string, timeLabel: string) => {
    const { on, hour } = { ...DEFAULT_SETTINGS[which], ...settings[which] };
    return (
      <Stack gap="xs">
        <Switch label={switchLabel} description={description} checked={on} onChange={event => save(which, { on: event.currentTarget.checked })} />
        <NativeSelect
          label={timeLabel}
          data={HOUR_OPTIONS}
          value={String(hour)}
          onChange={event => save(which, { hour: Number(event.currentTarget.value) })}
          description={on && isInQuietHours(hour, settings.quietHours) ? 'Your reminder is still sent at this hour' : undefined}
        />
      </Stack>
    );
  };

  return (
    <Stack gap="lg">
      {block('digest', 'Daily summary', 'One message a day with what is due today, and anything still waiting.', 'Daily summary time')}
      {block('dueNudges', 'Due-day reminders', 'A message for each task of yours that is due today.', 'Due-day reminder time')}
      {block('plannedDay', 'Planned-day reminder', 'A message the day before and the morning of a project\'s planned day. It says how many are planned, never which.', 'Planned-day reminder time')}
      {failed && <Text size="sm" role="alert">Could not save that. Try again.</Text>}
      <Text size="sm">Times are in your household's time zone.</Text>
    </Stack>
  );
}
