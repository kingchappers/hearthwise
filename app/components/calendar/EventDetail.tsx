import { useState } from 'react';
import { Button, Group, Stack, Text } from '@mantine/core';
import type { EventView } from '../../../src/calendar/types';
import type { TimelineItem } from '../../../src/shared/timeline';
import type { CalendarActions } from '~/hooks/useCalendarActions';
import { NOT_SAVED, repeatText, timeRange } from '~/lib/calendarText';
import { formatDay } from '~/lib/taskText';
import { MAX_SKIP_DAYS } from '../../../src/shared/calendarValidation';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';

// The event as it was when the sheet opened on it, and the occurrence that was tapped. A change underneath does not move it: what is
// shown is what an action will act on.
export interface SelectedEvent {
  event: EventView;
  item: TimelineItem;
}

export interface EventDetailProps {
  opened: boolean;
  selected: SelectedEvent | undefined;
  // A write for this event is waiting: nothing more can be done to it until that is saved.
  unsaved: boolean;
  onEdit: (event: EventView) => void;
  onClose: () => void;
  actions: Pick<CalendarActions, 'remove' | 'skipDay'>;
}

const BUTTON = { minHeight: 44 };

function Content({ selected, unsaved, onEdit, onClose, actions }: Omit<EventDetailProps, 'opened' | 'selected'> & { selected: SelectedEvent }) {
  const { event, item } = selected;
  // One tap is one action: a second tap before the sheet has closed does nothing.
  const [acted, setActed] = useState(false);
  const off = unsaved || acted;
  const act = (run: () => void): void => { if (acted) return; setActed(true); run(); onClose(); };
  const repeats = repeatText(event.repeat, event.repeatEndsOn);
  const canSkip = event.repeat.type === 'fixed' && !event.skipOn.includes(item.on) && event.skipOn.length < MAX_SKIP_DAYS;
  const when = event.allDay ? `${formatDay(item.on)}, All day` : `${formatDay(item.on)}, ${timeRange(item)}`;
  return (
    <Stack>
      <Text>{when}</Text>
      <Text>{`For: ${item.who}`}</Text>
      {event.kind === 'block' && <Text>Block</Text>}
      {event.place !== undefined && <Text style={{ overflowWrap: 'anywhere' }}>{`Where: ${event.place}`}</Text>}
      {event.notes !== undefined && <Text style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{event.notes}</Text>}
      {repeats && <Text>{repeats}</Text>}
      {event.private && <Text>Private: only you can see the details</Text>}
      {unsaved && <Text role="status">{NOT_SAVED}</Text>}
      <Group gap="xs">
        <Button style={BUTTON} disabled={off} onClick={() => onEdit(event)}>Edit</Button>
        {canSkip && (
          <Button variant="default" style={BUTTON} disabled={off} onClick={() => act(() => actions.skipDay(event, item.on))}>Skip this day</Button>
        )}
        <Button variant="default" style={BUTTON} disabled={off} onClick={() => act(() => actions.remove(event))}>Delete</Button>
      </Group>
    </Stack>
  );
}

export function EventDetail({ opened, selected, ...rest }: EventDetailProps) {
  return (
    <ResponsiveSheet opened={opened && selected !== undefined} onClose={rest.onClose} title={selected?.event.title ?? ''}>
      {selected && <Content selected={selected} {...rest} />}
    </ResponsiveSheet>
  );
}
