import { Group, Paper, Stack, Text, UnstyledButton } from '@mantine/core';
import { Link } from 'react-router';
import type { FeedView } from '../../../src/calendar/types';
import type { Timeline, TimelineItem } from '../../../src/shared/timeline';
import { COLOUR_FILL, colourOfMember, initialOf, markOf, orderedMembers } from '~/lib/calendarPeople';
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

// The round badge is the first member's, the square one the second's: each also has its colour, but the shape and the written name
// say it too, so colour is never the only sign. Hidden from screen readers because the name is in the text.
function Badge({ person, members, round, overlap }: { person: Person | undefined; members: Person[]; round: boolean; overlap?: boolean }) {
  if (!person) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        ...COLOUR_FILL[colourOfMember(person, members)], display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: BADGE, height: BADGE, flex: 'none',
        fontWeight: 700, fontSize: 14, borderRadius: round ? '50%' : 6, border: '2px solid var(--mantine-color-body)', marginLeft: overlap ? -10 : 0,
      }}
    >
      {initialOf(person.displayName)}
    </span>
  );
}

function Marks({ mark, members }: { mark: Mark; members: Person[] }) {
  if (mark === 'none') return null;
  const [first, second] = orderedMembers(members);
  if (mark === 'both') {
    return <span data-person="both" style={{ display: 'inline-flex' }}><Badge person={first} members={members} round /><Badge person={second} members={members} round={false} overlap /></span>;
  }
  return (
    <span data-person={mark} style={{ display: 'inline-flex' }}>
      <Badge person={mark === 'first' ? first : second} members={members} round={mark === 'first'} />
    </span>
  );
}

// The coloured edge down the card's left side: one colour for one person, split in two for both of you, and none for the rest.
function Edge({ mark, members }: { mark: Mark; members: Person[] }) {
  if (mark === 'none') return null;
  const [first, second] = orderedMembers(members);
  const fillOf = (person: Person | undefined): string => (person ? COLOUR_FILL[colourOfMember(person, members)].background : 'transparent');
  const background = mark === 'both'
    ? `linear-gradient(to bottom, ${fillOf(first)} 50%, ${fillOf(second)} 50%)`
    : fillOf(mark === 'first' ? first : second);
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
      <Edge mark={mark} members={members} />
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
        <Stack gap={2} style={{ minWidth: 0 }}>
          {item.type !== 'task' && item.type !== 'dinner' && item.type !== 'project' && <Text size="sm" fw={600}>{timeRange(item)}</Text>}
          <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{item.label}</Text>
          {meta !== '' && <Text size="sm">{meta}</Text>}
          {item.approx === true && <Text size="sm">{APPROX}</Text>}
          {feedLine !== undefined && <Text size="sm">{feedLine}</Text>}
          {unsaved && <Text size="sm">{NOT_SAVED}</Text>}
        </Stack>
        <Marks mark={mark} members={members} />
      </Group>
    </Paper>
  );
}

function Row({ item, unsaved, feedLine, members, onOpen }: { item: TimelineItem; unsaved: boolean; feedLine?: string; members: Person[]; onOpen: (item: TimelineItem) => void }) {
  const card = (saved: boolean) => <Card item={item} unsaved={saved} feedLine={feedLine} members={members} />;
  // An imported item is read from someone's calendar and never edited here: no button, no link.
  if (item.feedId !== undefined) return <div style={ROW}>{card(false)}</div>;
  if (item.type === 'task') return <Link to={`/tasks/${item.taskId}`} style={ROW}>{card(false)}</Link>;
  if (item.type === 'project') return <Link to={`/plan/projects/${item.projectId}`} style={ROW}>{card(false)}</Link>;
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
