import { useState } from 'react';
import { Button, Group, List, Stack, Switch, Text, TextInput } from '@mantine/core';
import type { FeedShare, FeedView } from '../../../src/calendar/types';
import { MAX_FEED_LABEL } from '../../../src/shared/calendarValidation';
import type { FeedActions, FeedOutcome } from '~/hooks/useFeedActions';
import { feedNotes, feedUpdatedText, PROVIDER_STEPS, providerName, SLOW_PROVIDER } from '~/lib/calendarText';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';

export interface FeedsSheetProps {
  opened: boolean;
  onClose: () => void;
  feeds: FeedView[];
  now: number;
  // Adding, replacing, refreshing and removing each need a signal: nothing about a feed is queued or saved on the device.
  online: boolean;
  otherName: string;
  actions: FeedActions;
}

const BUTTON = { minHeight: 44 };
const NEEDS_SIGNAL = 'Needs a signal';

const showsDetails = (share: FeedShare): boolean => share === 'details';
const showText = (otherName: string): string => `Show details to ${otherName}`;

// Runs one action and keeps what came back to say: the words for a refusal, or nothing.
function useAttempt(): { busy: boolean; message: string | undefined; run: (action: () => Promise<FeedOutcome>) => Promise<boolean> } {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const run = async (action: () => Promise<FeedOutcome>): Promise<boolean> => {
    setBusy(true);
    setMessage(undefined);
    const outcome = await action();
    setBusy(false);
    if (!outcome.ok) setMessage(outcome.message);
    return outcome.ok;
  };
  return { busy, message, run };
}

function Message({ text }: { text: string | undefined }) {
  return text === undefined ? null : <Text size="sm" role="status">{text}</Text>;
}

function ReplaceForm({ feed, online, actions, onDone }: { feed: FeedView; online: boolean; actions: FeedActions; onDone: () => void }) {
  const [link, setLink] = useState('');
  const attempt = useAttempt();
  const submit = async (): Promise<void> => {
    if (link.trim() === '') return;
    if (await attempt.run(() => actions.replace(feed.id, link.trim()))) { setLink(''); onDone(); }
  };
  return (
    <Stack gap="xs">
      <TextInput label="New link" value={link} onChange={event => setLink(event.currentTarget.value)} autoComplete="off" spellCheck={false} />
      <Message text={attempt.busy ? 'Checking the link...' : attempt.message} />
      <Group gap="xs">
        <Button style={BUTTON} disabled={!online || attempt.busy} onClick={() => { void submit(); }}>Replace</Button>
        <Button style={BUTTON} variant="default" onClick={() => { setLink(''); onDone(); }}>Cancel</Button>
      </Group>
    </Stack>
  );
}

function OwnFeedActions({ feed, online, otherName, actions }: { feed: FeedView; online: boolean; otherName: string; actions: FeedActions }) {
  const [mode, setMode] = useState<'none' | 'replace' | 'remove'>('none');
  const attempt = useAttempt();
  const disabled = !online || attempt.busy;

  if (mode === 'remove') {
    return (
      <Stack gap="xs">
        <Text size="sm">{`Remove ${feed.label}? Its events go from the calendar for both of you.`}</Text>
        <Group gap="xs">
          <Button style={BUTTON} disabled={disabled} onClick={() => { void attempt.run(() => actions.remove(feed.id)); }}>Yes, remove</Button>
          <Button style={BUTTON} variant="default" onClick={() => setMode('none')}>Keep it</Button>
        </Group>
        <Message text={attempt.message} />
      </Stack>
    );
  }
  if (mode === 'replace') return <ReplaceForm feed={feed} online={online} actions={actions} onDone={() => setMode('none')} />;

  return (
    <Stack gap="xs">
      <Switch
        label={showText(otherName)} checked={showsDetails(feed.share)} disabled={disabled}
        onChange={event => { void attempt.run(() => actions.edit(feed.id, { share: event.currentTarget.checked ? 'details' : 'busy' })); }}
      />
      <Group gap="xs">
        <Button style={BUTTON} variant="default" disabled={disabled} onClick={() => { void attempt.run(() => actions.refresh(feed.id)); }}>Refresh now</Button>
        <Button style={BUTTON} variant="default" disabled={disabled} onClick={() => setMode('replace')}>Replace link</Button>
        <Button style={BUTTON} variant="default" disabled={disabled} onClick={() => setMode('remove')}>Remove</Button>
      </Group>
      <Message text={attempt.message} />
    </Stack>
  );
}

function FeedRow({ feed, now, online, otherName, actions }: { feed: FeedView; now: number; online: boolean; otherName: string; actions: FeedActions }) {
  const provider = feed.mine ? providerName(feed.host) : undefined;
  return (
    <Stack gap={4}>
      <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{feed.label}</Text>
      <Text size="sm">{`${feed.owner} · ${showsDetails(feed.share) ? 'Shows details' : 'Busy only'}`}</Text>
      {feed.mine && feed.host !== undefined && <Text size="sm">{`${feed.host}, link hidden`}</Text>}
      <Text size="sm">{feedUpdatedText(feed, now)}</Text>
      {feedNotes(feed).map(note => <Text key={note} size="sm">{note}</Text>)}
      {provider === 'Google' && <Text size="sm">{SLOW_PROVIDER}</Text>}
      {feed.mine && <OwnFeedActions feed={feed} online={online} otherName={otherName} actions={actions} />}
    </Stack>
  );
}

function AddForm({ online, otherName, actions, onDone }: { online: boolean; otherName: string; actions: FeedActions; onDone: () => void }) {
  const [link, setLink] = useState('');
  const [label, setLabel] = useState('');
  const [share, setShare] = useState<FeedShare>('busy');
  const [submitted, setSubmitted] = useState(false);
  // Made once, when the form opens: a second tap after a refusal is the same feed, never a second one.
  const [id] = useState(() => crypto.randomUUID());
  const attempt = useAttempt();

  const submit = async (): Promise<void> => {
    setSubmitted(true);
    if (link.trim() === '' || label.trim() === '') return;
    if (await attempt.run(() => actions.add({ id, link: link.trim(), label: label.trim(), share }))) { setLink(''); onDone(); }
  };

  return (
    <Stack gap="xs">
      <List size="sm" spacing={4} listStyleType="none" styles={{ root: { paddingInlineStart: 0 } }}>
        {PROVIDER_STEPS.map(step => <List.Item key={step.name}>{step.steps}</List.Item>)}
      </List>
      <TextInput label="Link" value={link} onChange={event => setLink(event.currentTarget.value)} autoComplete="off" spellCheck={false} error={submitted && link.trim() === '' ? 'Add a link' : undefined} />
      <TextInput label="Name" value={label} maxLength={MAX_FEED_LABEL} onChange={event => setLabel(event.currentTarget.value)} error={submitted && label.trim() === '' ? 'Add a name' : undefined} />
      <Switch label={showText(otherName)} checked={showsDetails(share)} onChange={event => setShare(event.currentTarget.checked ? 'details' : 'busy')} />
      <Message text={attempt.busy ? 'Checking the link...' : attempt.message} />
      <Group gap="xs">
        <Button style={BUTTON} disabled={!online || attempt.busy} onClick={() => { void submit(); }}>Add calendar</Button>
        <Button style={BUTTON} variant="default" onClick={onDone}>Cancel</Button>
      </Group>
    </Stack>
  );
}

// Every calendar feed the household has, with what each person may do: anyone can read, and only the person who added a feed can
// refresh, rename, change what is shown, replace its link or remove it. A link is typed here and goes straight to the server; it is
// kept in nothing but this form's own state, and cleared when the form closes.
export function FeedsSheet({ opened, onClose, feeds, now, online, otherName, actions }: FeedsSheetProps) {
  const [adding, setAdding] = useState(false);
  return (
    <ResponsiveSheet opened={opened} onClose={onClose} title="Calendars">
      <Stack>
        {feeds.length === 0 ? <Text>No calendars added yet</Text> : (
          <ul style={{ margin: 0, padding: 0 }}>
            {feeds.map(feed => (
              <li key={feed.id} style={{ listStyle: 'none', paddingBlock: 8 }}>
                <FeedRow feed={feed} now={now} online={online} otherName={otherName} actions={actions} />
              </li>
            ))}
          </ul>
        )}
        {adding ? <AddForm online={online} otherName={otherName} actions={actions} onDone={() => setAdding(false)} /> : (
          <Button style={BUTTON} disabled={!online} onClick={() => setAdding(true)}>{online ? 'Add a calendar' : NEEDS_SIGNAL}</Button>
        )}
      </Stack>
    </ResponsiveSheet>
  );
}
