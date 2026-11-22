import { Switch } from '@mantine/core';
import { useHousehold, useUpdateMe } from '~/lib/household';

// Dates also say how far away they are. Off by default: exact dates and times are always shown, and this only adds to them.
export function RelativeTimes() {
  const household = useHousehold();
  const update = useUpdateMe();
  const settings = household.data?.me.settings;
  if (!settings) return null;
  return (
    <Switch
      label="Show how far away dates are"
      description="Adds words like 'in 2 days' or 'tomorrow' beside a date that is still to come. The exact date stays."
      checked={settings.relativeTimes === true}
      onChange={event => { update.mutateAsync({ settings: { relativeTimes: event.currentTarget.checked } }).catch((error: unknown) => console.error('RelativeTimes: could not save', error)); }}
    />
  );
}
