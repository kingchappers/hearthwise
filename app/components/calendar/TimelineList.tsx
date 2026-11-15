import { Stack, Text, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router';
import type { Timeline, TimelineItem } from '../../../src/shared/timeline';
import { NOT_SAVED, timeRange } from '~/lib/calendarText';

export interface TimelineListProps {
  timeline: Timeline;
  // The events that have a write waiting.
  unsavedIds: ReadonlySet<string>;
  onOpen: (item: TimelineItem) => void;
}

const ROW = { display: 'block', width: '100%', minHeight: 44, paddingBlock: 6, textAlign: 'left', color: 'inherit', textDecoration: 'none' } as const;

function metaLine(item: TimelineItem): string {
  return [item.who, item.type === 'block' ? 'Block' : '', item.place === undefined ? '' : `At ${item.place}`].filter(part => part !== '').join(' · ');
}

function Body({ item, unsaved }: { item: TimelineItem; unsaved: boolean }) {
  const meta = metaLine(item);
  return (
    <Stack gap={2}>
      {item.type !== 'task' && item.type !== 'dinner' && <Text size="sm" fw={600}>{timeRange(item)}</Text>}
      <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{item.label}</Text>
      {meta !== '' && <Text size="sm">{meta}</Text>}
      {unsaved && <Text size="sm">{NOT_SAVED}</Text>}
    </Stack>
  );
}

function Row({ item, unsaved, onOpen }: { item: TimelineItem; unsaved: boolean; onOpen: (item: TimelineItem) => void }) {
  if (item.type === 'task') return <Link to={`/tasks/${item.taskId}`} style={ROW}><Body item={item} unsaved={false} /></Link>;
  if (item.type === 'dinner') return <Link to="/plan" style={ROW}><Body item={item} unsaved={false} /></Link>;
  // Someone else's private event can be seen to be there, and nothing more: it has no id to open.
  if (item.type === 'busy') return <div style={ROW}><Body item={item} unsaved={false} /></div>;
  return <UnstyledButton style={ROW} onClick={() => onOpen(item)}><Body item={item} unsaved={unsaved} /></UnstyledButton>;
}

// One day's items: the strip of all-day items, tasks due and the dinner first, then the timed items in order. Overlaps are listed one
// after another, never side by side.
export function TimelineList({ timeline, unsavedIds, onOpen }: TimelineListProps) {
  const items = [...timeline.allDay, ...timeline.timed];
  if (items.length === 0) return <Text>Nothing on</Text>;
  return (
    <ul style={{ margin: 0, padding: 0 }}>
      {items.map(item => (
        <li key={item.key} style={{ listStyle: 'none' }}>
          <Row item={item} unsaved={item.eventId !== undefined && unsavedIds.has(item.eventId)} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}
