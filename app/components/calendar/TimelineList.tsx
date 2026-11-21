import { Group, Paper, Stack, Text, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router';
import type { FeedView } from '../../../src/calendar/types';
import type { Timeline, TimelineItem } from '../../../src/shared/timeline';
import { initialOf, MARK_FILL, markOf } from '~/lib/calendarPeople';
import type { Mark, Person } from '~/lib/calendarPeople';
import { feedUpdatedText, NOT_SAVED, timeRange } from '~/lib/calendarText';

export interface TimelineListProps {
  timeline: Timeline;
  // The events that have a write waiting.
  unsavedIds: ReadonlySet<string>;
  // The feeds behind any imported items, and the time to say their age against.
  feeds?: FeedView[];
  now?: number;
  // The household's members, so each person's items carry their own mark.
  members?: Person[];
  onOpen: (item: TimelineItem) => void;
}

const ROW = { display: 'block', width: '100%', minHeight: 44, textAlign: 'left', color: 'inherit', textDecoration: 'none' } as const;
const EDGE = 6;
const BADGE = 28;

// The round badge is the first member's, the square one the second's: each also has its own colour, but the shape and the written name
// say it too, so colour is never the only sign. Hidden from screen readers because the name is in the text.
function Badge({ mark, letter, overlap }: { mark: 'first' | 'second'; letter: string; overlap?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        ...MARK_FILL[mark], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: BADGE, height: BADGE, flex: 'none', fontWeight: 700, fontSize: 14,
        borderRadius: mark === 'first' ? '50%' : 6, border: '2px solid var(--mantine-color-body)', marginLeft: overlap ? -10 : 0,
      }}
    >
      {letter}
    </span>
  );
}

function Marks({ mark, who, members }: { mark: Mark; who: string; members: Person[] }) {
  if (mark === 'none') return null;
  const ordered = [...members].sort((a, b) => (a.userId < b.userId ? -1 : 1));
  if (mark === 'both') {
    return <span data-person="both" style={{ display: 'inline-flex' }}><Badge mark="first" letter={initialOf(ordered[0]?.displayName ?? '')} /><Badge mark="second" letter={initialOf(ordered[1]?.displayName ?? '')} overlap /></span>;
  }
  return <span data-person={mark} style={{ display: 'inline-flex' }}><Badge mark={mark} letter={initialOf(who)} /></span>;
}

// The coloured edge down the card's left side: one colour for one person, split in two for both of you, and none for the rest.
function Edge({ mark }: { mark: Mark }) {
  if (mark === 'none') return null;
  const background = mark === 'both'
    ? `linear-gradient(to bottom, ${MARK_FILL.first.background} 50%, ${MARK_FILL.second.background} 50%)`
    : MARK_FILL[mark].background;
  return <span aria-hidden="true" style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, width: EDGE, background }} />;
}

function metaLine(item: TimelineItem): string {
  return [item.who, item.type === 'block' ? 'Block' : '', item.place === undefined ? '' : `At ${item.place}`].filter(part => part !== '').join(' · ');
}

const APPROX = 'Time may be an hour out';

// One item as its own card: the time first, then what it is, then who and where, with the person's mark at the right.
function Card({ item, unsaved, feedLine, members }: { item: TimelineItem; unsaved: boolean; feedLine?: string; members: Person[] }) {
  const meta = metaLine(item);
  const mark = markOf(item.who, members);
  return (
    <Paper data-card withBorder radius="md" p="sm" style={{ position: 'relative', overflow: 'hidden', paddingInlineStart: `calc(var(--mantine-spacing-sm) + ${EDGE}px)` }}>
      <Edge mark={mark} />
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
        <Stack gap={2} style={{ minWidth: 0 }}>
          {item.type !== 'task' && item.type !== 'dinner' && <Text size="sm" fw={600}>{timeRange(item)}</Text>}
          <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{item.label}</Text>
          {meta !== '' && <Text size="sm">{meta}</Text>}
          {item.approx === true && <Text size="sm">{APPROX}</Text>}
          {feedLine !== undefined && <Text size="sm">{feedLine}</Text>}
          {unsaved && <Text size="sm">{NOT_SAVED}</Text>}
        </Stack>
        <Marks mark={mark} who={item.who} members={members} />
      </Group>
    </Paper>
  );
}

function Row({ item, unsaved, feedLine, members, onOpen }: { item: TimelineItem; unsaved: boolean; feedLine?: string; members: Person[]; onOpen: (item: TimelineItem) => void }) {
  const card = (saved: boolean) => <Card item={item} unsaved={saved} feedLine={feedLine} members={members} />;
  // An imported item is read from someone's calendar and never edited here: no button, no link.
  if (item.feedId !== undefined) return <div style={ROW}>{card(false)}</div>;
  if (item.type === 'task') return <Link to={`/tasks/${item.taskId}`} style={ROW}>{card(false)}</Link>;
  if (item.type === 'dinner') return <Link to="/plan" style={ROW}>{card(false)}</Link>;
  // Someone else's private event can be seen to be there, and nothing more: it has no id to open.
  if (item.type === 'busy') return <div style={ROW}>{card(false)}</div>;
  return <UnstyledButton style={ROW} onClick={() => onOpen(item)}>{card(unsaved)}</UnstyledButton>;
}

function feedLineFor(item: TimelineItem, feeds: FeedView[], now: number): string | undefined {
  const feed = feeds.find(candidate => candidate.id === item.feedId);
  return feed === undefined ? undefined : feedUpdatedText(feed, now);
}

// One day's items: the strip of all-day items, tasks due and the dinner first, then the timed items in order. Overlaps are listed one
// after another, never side by side.
export function TimelineList({ timeline, unsavedIds, feeds = [], now = Date.now(), members = [], onOpen }: TimelineListProps) {
  const items = [...timeline.allDay, ...timeline.timed];
  if (items.length === 0) return <Text>Nothing on</Text>;
  return (
    <ul style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => (
        <li key={item.key} style={{ listStyle: 'none' }}>
          <Row item={item} unsaved={item.eventId !== undefined && unsavedIds.has(item.eventId)} feedLine={feedLineFor(item, feeds, now)} members={members} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}
