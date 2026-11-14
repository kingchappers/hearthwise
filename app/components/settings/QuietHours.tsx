import { Group, NativeSelect, Stack, Switch } from '@mantine/core';
import { useHousehold, useUpdateMe } from '~/lib/household';
import { HOUR_OPTIONS } from './hours';

const DEFAULT_QUIET = { start: 22, end: 7 };

// Messages the other person chooses to send you wait until these hours end. Your own reminders are not held.
export function QuietHours() {
  const household = useHousehold();
  const update = useUpdateMe();
  const quiet = household.data?.me.settings.quietHours;
  if (!household.data) return null;

  const save = (quietHours: { start: number; end: number } | null): void => {
    update.mutateAsync({ settings: { quietHours } }).catch((error: unknown) => console.error('QuietHours: could not save', error));
  };

  return (
    <Stack gap="xs">
      <Switch
        label="Quiet hours"
        description="Messages the other person sends you wait until quiet hours end. Your own reminders still arrive."
        checked={quiet !== null && quiet !== undefined}
        onChange={event => save(event.currentTarget.checked ? DEFAULT_QUIET : null)}
      />
      {quiet && (
        <Group grow align="flex-end">
          <NativeSelect label="Quiet hours start" data={HOUR_OPTIONS} value={String(quiet.start)} onChange={event => save({ ...quiet, start: Number(event.currentTarget.value) })} />
          <NativeSelect label="Quiet hours end" data={HOUR_OPTIONS} value={String(quiet.end)} onChange={event => save({ ...quiet, end: Number(event.currentTarget.value) })} />
        </Group>
      )}
    </Stack>
  );
}
