import { Stack, Text, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router';
import type { FeedView } from '../../../src/calendar/types';
import type { Timeline, TimelineItem } from '../../../src/shared/timeline';
import { feedUpdatedText, NOT_SAVED, timeRange } from '~/lib/calendarText';

export interface TimelineListProps {
  timeline: Timeline;
  // The events that have a write waiting.
  unsavedIds: ReadonlySet<string>;
  // The feeds behind any imported items, and the time to say their age against.
  feeds?: FeedView[];
  now?: number;
  onOpen: (item: TimelineItem) => void;
}

const ROW = { display: 'block', width: '100%', minHeight: 44, paddingBlock: 6, textAlign: 'left', color: 'inherit', textDecoration: 'none' } as const;

function metaLine(item: TimelineItem): string {
  return [item.who, item.type === 'block' ? 'Block' : '', item.place === undefined ? '' : `At ${item.place}`].filter(part => part !== '').join(' · ');
}

const APPROX = 'Time may be an hour out';

function Body({ item, unsaved, feedLine }: { item: TimelineItem; unsaved: boolean; feedLine?: string }) {
  const meta = metaLine(item);
  return (
    <Stack gap={2}>
      {item.type !== 'task' && item.type !== 'dinner' && item.type !== 'project' && <Text size="sm" fw={600}>{timeRange(item)}</Text>}
      <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{item.label}</Text>
      {meta !== '' && <Text size="sm">{meta}</Text>}
      {item.approx === true && <Text size="sm">{APPROX}</Text>}
      {feedLine !== undefined && <Text size="sm">{feedLine}</Text>}
      {unsaved && <Text size="sm">{NOT_SAVED}</Text>}
    </Stack>
  );
}

function Row({ item, unsaved, feedLine, onOpen }: { item: TimelineItem; unsaved: boolean; feedLine?: string; onOpen: (item: TimelineItem) => void }) {
  // An imported item is read from someone's calendar and never edited here: no button, no link.
  if (item.feedId !== undefined) return <div style={ROW}><Body item={item} unsaved={false} feedLine={feedLine} /></div>;
  if (item.type === 'task') return <Link to={`/tasks/${item.taskId}`} style={ROW}><Body item={item} unsaved={false} /></Link>;
  if (item.type === 'project') return <Link to={`/plan/projects/${item.projectId}`} style={ROW}><Body item={item} unsaved={false} /></Link>;
  if (item.type === 'dinner') return <Link to="/plan" style={ROW}><Body item={item} unsaved={false} /></Link>;
  // Someone else's private event can be seen to be there, and nothing more: it has no id to open.
  if (item.type === 'busy') return <div style={ROW}><Body item={item} unsaved={false} /></div>;
  return <UnstyledButton style={ROW} onClick={() => onOpen(item)}><Body item={item} unsaved={unsaved} /></UnstyledButton>;
}

function feedLineFor(item: TimelineItem, feeds: FeedView[], now: number): string | undefined {
  const feed = feeds.find(candidate => candidate.id === item.feedId);
  return feed === undefined ? undefined : feedUpdatedText(feed, now);
}

// One day's items: the strip of all-day items, tasks due and the dinner first, then the timed items in order. Overlaps are listed one
// after another, never side by side.
export function TimelineList({ timeline, unsavedIds, feeds = [], now = Date.now(), onOpen }: TimelineListProps) {
  const items = [...timeline.allDay, ...timeline.timed];
  if (items.length === 0) return <Text>Nothing on</Text>;
  return (
    <ul style={{ margin: 0, padding: 0 }}>
      {items.map(item => (
        <li key={item.key} style={{ listStyle: 'none' }}>
          <Row item={item} unsaved={item.eventId !== undefined && unsavedIds.has(item.eventId)} feedLine={feedLineFor(item, feeds, now)} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}
