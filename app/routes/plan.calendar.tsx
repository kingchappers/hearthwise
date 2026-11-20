import { useState } from 'react';
import { Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import type { EventView } from '../../src/calendar/types';
import type { TimelineItem } from '../../src/shared/timeline';
import { DayView } from '~/components/calendar/DayView';
import { EventDetail } from '~/components/calendar/EventDetail';
import type { SelectedEvent } from '~/components/calendar/EventDetail';
import { EventSheet } from '~/components/calendar/EventSheet';
import { WeekView } from '~/components/calendar/WeekView';
import { LoadError } from '~/components/layout/LoadError';
import { LetThemKnow } from '~/components/shared/LetThemKnow';
import { useCalendarActions } from '~/hooks/useCalendarActions';
import { useTimelineSources } from '~/lib/calendar';
import { unsavedChanges, zoneNote } from '~/lib/calendarText';
import { pageTitle } from '~/lib/pageTitle';
import type { Route } from './+types/plan.calendar';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Calendar') }];

type View = 'day' | 'week';

const BUTTON = { minHeight: 44 };

function CalendarContent() {
  const sources = useTimelineSources();
  const actions = useCalendarActions();
  const [view, setView] = useState<View>('day');
  const [day, setDay] = useState<string | undefined>(undefined);
  const [adding, setAdding] = useState(false);
  // What the detail sheet was opened on, kept as it was: an action then acts on what the person saw.
  const [selected, setSelected] = useState<SelectedEvent | undefined>(undefined);
  const [editing, setEditing] = useState<EventView | undefined>(undefined);

  if (sources.status === 'loading') return <Group justify="center" py="xl" role="status" aria-label="Loading the calendar"><Loader /></Group>;
  if (sources.status === 'error') return <LoadError thing="calendar" onRetry={sources.calendar.refetch} />;

  const { calendar } = sources;
  const shown = day ?? calendar.today;
  const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const open = (item: TimelineItem): void => {
    const found = calendar.events.find(candidate => candidate.id === item.eventId);
    if (found && found.busy !== true) setSelected({ event: found, item });
  };
  const goToDay = (next: string): void => { setDay(next); setView('day'); };
  const closeEdit = (): void => { setEditing(undefined); setSelected(undefined); };
  const unsaved = selected !== undefined && calendar.unsavedIds.has(selected.event.id);

  return (
    <Stack maw={640}>
      <Group justify="space-between" align="center">
        <Title order={1} size="h3">Calendar</Title>
        <Button style={BUTTON} onClick={() => setAdding(true)}>Add</Button>
      </Group>
      <Group gap="xs">
        <Button variant={view === 'day' ? 'filled' : 'default'} style={BUTTON} aria-pressed={view === 'day'} onClick={() => setView('day')}>Day</Button>
        <Button variant={view === 'week' ? 'filled' : 'default'} style={BUTTON} aria-pressed={view === 'week'} onClick={() => setView('week')}>Week</Button>
      </Group>
      {calendar.unsaved > 0 && <Text role="status" size="sm">{unsavedChanges(calendar.unsaved)}</Text>}
      {deviceZone !== calendar.timezone && <Text size="sm">{zoneNote(calendar.timezone)}</Text>}
      <LetThemKnow />

      {view === 'day' ? (
        <DayView day={shown} today={calendar.today} inputsFor={sources.inputsFor} viewer={calendar.me} unsavedIds={calendar.unsavedIds} onDay={setDay} onOpen={open} />
      ) : (
        <WeekView start={shown} today={calendar.today} inputsFor={sources.inputsFor} viewer={calendar.me} unsavedIds={calendar.unsavedIds} onStart={setDay} onDay={goToDay} onOpen={open} />
      )}

      <EventSheet opened={adding} onClose={() => setAdding(false)} day={shown} me={calendar.me} members={calendar.members} actions={actions} />
      <EventSheet
        key={editing?.id ?? 'none'} opened={editing !== undefined} onClose={closeEdit} event={editing} day={shown} me={calendar.me}
        members={calendar.members} actions={actions}
      />
      <EventDetail
        opened={selected !== undefined && editing === undefined} selected={selected} unsaved={unsaved} actions={actions}
        onEdit={event => setEditing(event)} onClose={() => setSelected(undefined)}
      />
    </Stack>
  );
}

export default function CalendarPage() {
  return <CalendarContent />;
}
