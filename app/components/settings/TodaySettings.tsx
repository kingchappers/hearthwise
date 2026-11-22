import { Stack, Switch } from '@mantine/core';
import { useHousehold, useUpdateMe } from '~/lib/household';

// What Today shows beyond your tasks. Both are on until you turn them off, and they are yours alone: the other person keeps their own.
export function TodaySettings() {
  const household = useHousehold();
  const update = useUpdateMe();
  const settings = household.data?.me.settings;
  if (!settings) return null;
  const save = (change: { todayComingUp?: boolean; todayProjects?: boolean }): void => {
    update.mutateAsync({ settings: change }).catch((error: unknown) => console.error('TodaySettings: could not save', error));
  };
  return (
    <Stack gap="md">
      <Switch
        label="Show Coming up on Today"
        description="The next few things on the calendar, over the next three days."
        checked={settings.todayComingUp !== false}
        onChange={event => save({ todayComingUp: event.currentTarget.checked })}
      />
      <Switch
        label="Show projects on Today"
        description="One line for a project when the other person has taken some of its steps, or when its planned day is within a week."
        checked={settings.todayProjects !== false}
        onChange={event => save({ todayProjects: event.currentTarget.checked })}
      />
    </Stack>
  );
}
