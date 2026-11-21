import { Button, Group, Stack, Title } from '@mantine/core';
import { addDays } from '../../../src/shared/schedule';
import { buildTimeline } from '../../../src/shared/timeline';
import type { TimelineInputs, TimelineItem } from '../../../src/shared/timeline';
import { dayHeading } from '~/lib/calendarText';
import { TimelineList } from './TimelineList';

export interface DayViewProps {
  day: string;
  today: string;
  inputsFor: (day: string) => TimelineInputs;
  viewer: string;
  unsavedIds: ReadonlySet<string>;
  // The time each imported item's feed age is said against.
  now?: number;
  onDay: (day: string) => void;
  onOpen: (item: TimelineItem) => void;
}

const BUTTON = { minHeight: 44 };

export function DayView({ day, today, inputsFor, viewer, unsavedIds, now, onDay, onOpen }: DayViewProps) {
  const inputs = inputsFor(day);
  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Button variant="default" style={BUTTON} onClick={() => onDay(addDays(day, -1))}>Previous day</Button>
        <Button variant="default" style={BUTTON} disabled={day === today} onClick={() => onDay(today)}>Today</Button>
        <Button variant="default" style={BUTTON} onClick={() => onDay(addDays(day, 1))}>Next day</Button>
      </Group>
      <Title order={2} size="h4">{dayHeading(day, today)}</Title>
      <TimelineList timeline={buildTimeline(day, inputs, viewer)} unsavedIds={unsavedIds} feeds={inputs.feeds} members={inputs.members} now={now} onOpen={onOpen} />
    </Stack>
  );
}
