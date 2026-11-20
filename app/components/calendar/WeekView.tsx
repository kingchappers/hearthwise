import { Button, Group, Stack, Title } from '@mantine/core';
import { addDays } from '../../../src/shared/schedule';
import { buildTimeline } from '../../../src/shared/timeline';
import type { TimelineInputs, TimelineItem } from '../../../src/shared/timeline';
import { dayHeading } from '~/lib/calendarText';
import { weekDays } from '~/lib/plan';
import { TimelineList } from './TimelineList';

export interface WeekViewProps {
  // The first of the seven days.
  start: string;
  today: string;
  inputsFor: (day: string) => TimelineInputs;
  viewer: string;
  unsavedIds: ReadonlySet<string>;
  // The time each imported item's feed age is said against.
  now?: number;
  onStart: (day: string) => void;
  onDay: (day: string) => void;
  onOpen: (item: TimelineItem) => void;
}

const BUTTON = { minHeight: 44 };

// Seven days as rows, one to a row: a list, not a grid, so it reads at 360px and at the largest text size.
export function WeekView({ start, today, inputsFor, viewer, unsavedIds, now, onStart, onDay, onOpen }: WeekViewProps) {
  return (
    <Stack gap="md">
      <Group gap="xs">
        <Button variant="default" style={BUTTON} onClick={() => onStart(addDays(start, -7))}>Previous week</Button>
        <Button variant="default" style={BUTTON} disabled={start === today} onClick={() => onStart(today)}>This week</Button>
        <Button variant="default" style={BUTTON} onClick={() => onStart(addDays(start, 7))}>Next week</Button>
      </Group>
      {weekDays(start, 7).map(day => {
        const heading = dayHeading(day, today);
        const inputs = inputsFor(day);
        return (
          <section key={day} aria-label={heading}>
            <Group justify="space-between" align="center" wrap="wrap" gap="xs">
              <Title order={2} size="h5">{heading}</Title>
              <Button variant="subtle" style={BUTTON} aria-label={`See this day, ${heading}`} onClick={() => onDay(day)}>See this day</Button>
            </Group>
            <TimelineList timeline={buildTimeline(day, inputs, viewer)} unsavedIds={unsavedIds} feeds={inputs.feeds} now={now} onOpen={onOpen} />
          </section>
        );
      })}
    </Stack>
  );
}
