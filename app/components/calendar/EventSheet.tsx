import { useEffect, useState } from 'react';
import { clearTextDraft, readTextDraft, writeTextDraft } from '~/lib/textDrafts';
import { Button, NativeSelect, Radio, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import type { EventKind, EventView } from '../../../src/calendar/types';
import { MAX_NOTES, MAX_PLACE, MAX_TITLE } from '../../../src/shared/calendarValidation';
import type { CalendarActions } from '~/hooks/useCalendarActions';
import { blankForm, changesFrom, evaluateForm, formFromEvent } from '~/lib/calendarForm';
import type { EventForm } from '~/lib/calendarForm';
import { privateText } from '~/lib/calendarText';
import type { NamedMember } from '~/lib/taskText';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';
import { LetThemKnow } from '../shared/LetThemKnow';
import { RepeatPicker } from '../tasks/RepeatPicker';

export interface EventSheetProps {
  opened: boolean;
  onClose: () => void;
  // The event being edited, as it was when the sheet opened on it. Left out to add.
  event?: EventView;
  // The day an added event starts on.
  day: string;
  me: string;
  members: NamedMember[];
  actions: Pick<CalendarActions, 'add' | 'edit'>;
}

const BUTTON = { minHeight: 44 };
const KINDS: { value: EventKind; label: string }[] = [{ value: 'event', label: 'Event' }, { value: 'block', label: 'Block, a routine like Wind down' }];

const title = (event: EventView | undefined): string => (event ? `Edit ${event.kind}` : 'Add to the calendar');

function Content({ onClose, event, day, me, members, actions }: Omit<EventSheetProps, 'opened'>) {
  const other = members.find(member => member.userId !== me);
  // Only people who can be chosen are shown: with nobody else (or a former member named) it is the person themselves.
  const choosable = (who: string): string => (who === me || who === 'both' || who === other?.userId) && (who !== 'both' || other) ? who : me;
  const [form, setForm] = useState<EventForm>(() => {
    const start = event ? formFromEvent(event) : blankForm(day);
    // A new event's words are kept on this device until it is added, so a tap outside, Escape or a reload does not lose them.
    const kept = event ? {} : { title: readTextDraft(me, 'newevent:title') ?? start.title, notes: readTextDraft(me, 'newevent:notes') ?? start.notes };
    return { ...start, ...kept, who: choosable(start.who) };
  });
  useEffect(() => {
    if (event) return;
    writeTextDraft(me, 'newevent:title', form.title);
    writeTextDraft(me, 'newevent:notes', form.notes);
  }, [event, me, form.title, form.notes]);
  const [submitted, setSubmitted] = useState(false);
  // Made once, when the sheet opens, and kept while it is open: a double tap is one event.
  const [ids] = useState(() => ({ id: crypto.randomUUID(), mutationId: crypto.randomUUID() }));
  const set = (patch: Partial<EventForm>): void => setForm(current => ({ ...current, ...patch }));

  const result = evaluateForm(form, me);
  const errorFor = (field: keyof typeof result.errors): string | undefined => (submitted ? result.errors[field] : undefined);
  // Only the maker may make an event private or not.
  const mayChoosePrivate = event === undefined || event.createdBy === me;
  const who = [
    { value: me, label: `${members.find(member => member.userId === me)?.displayName ?? 'You'} (you)` },
    ...(other ? [{ value: other.userId, label: other.displayName }] : []),
    ...(other ? [{ value: 'both', label: 'Both of you' }] : []),
  ];

  function submit(submission: React.FormEvent): void {
    submission.preventDefault();
    setSubmitted(true);
    if (!result.valid || !result.schedule || !result.people) return;

    if (!event) {
      actions.add({
        ...ids, kind: form.kind, title: result.title, schedule: result.schedule, people: result.people,
        ...(result.place === '' ? {} : { place: result.place }), ...(result.notes === '' ? {} : { notes: result.notes }),
      });
    } else {
      const changes = changesFrom(event, result, me);
      if (Object.keys(changes).length > 0) actions.edit(event, changes);
    }
    clearTextDraft(me, 'newevent:title');
    clearTextDraft(me, 'newevent:notes');
    onClose();
  }

  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        {!event && (
          <Radio.Group label="What are you adding?" value={form.kind} onChange={value => set({ kind: value as EventKind })}>
            <Stack gap="xs" mt="xs">
              {KINDS.map(kind => <Radio key={kind.value} value={kind.value} label={kind.label} styles={{ root: { minHeight: 44, display: 'flex', alignItems: 'center' } }} />)}
            </Stack>
          </Radio.Group>
        )}
        <TextInput label="Title" value={form.title} onChange={change => set({ title: change.currentTarget.value })} maxLength={MAX_TITLE} error={errorFor('title')} />
        <TextInput label="Where (optional)" value={form.place} onChange={change => set({ place: change.currentTarget.value })} maxLength={MAX_PLACE} error={errorFor('place')} />

        {!form.private && <NativeSelect label="Who is it for?" data={who} value={form.who} onChange={change => set({ who: change.currentTarget.value })} />}
        {mayChoosePrivate && other && (
          <Switch label="Private" description={privateText(other.displayName)} checked={form.private} onChange={change => set({ private: change.currentTarget.checked })} />
        )}

        <TextInput label="Date" type="date" value={form.startOn} onChange={change => set({ startOn: change.currentTarget.value })} error={errorFor('startOn')} />
        <Switch label="All day" checked={form.allDay} onChange={change => set({ allDay: change.currentTarget.checked })} />
        {form.allDay ? (
          <TextInput
            label="Last day (if it lasts more than one day)" type="date" value={form.lastDay} onChange={change => set({ lastDay: change.currentTarget.value })} error={errorFor('lastDay')}
          />
        ) : (
          <>
            <TextInput label="Starts at" type="time" value={form.startTime} onChange={change => set({ startTime: change.currentTarget.value })} error={errorFor('startTime')} />
            <TextInput
              label="Length in minutes" inputMode="numeric" value={form.durationMin} onChange={change => set({ durationMin: change.currentTarget.value })} error={errorFor('durationMin')}
            />
          </>
        )}

        <RepeatPicker value={form.repeat} today={form.startOn} allowAfter={false} onChange={repeat => set({ repeat })} />
        {form.repeat.type === 'fixed' && (
          <TextInput label="Repeat until (optional)" type="date" value={form.repeatEndsOn} onChange={change => set({ repeatEndsOn: change.currentTarget.value })} error={errorFor('repeatEndsOn')} />
        )}

        <Textarea label="Notes (optional)" value={form.notes} onChange={change => set({ notes: change.currentTarget.value })} maxLength={MAX_NOTES} autosize minRows={2} error={errorFor('notes')} />

        {form.private
          ? <Text size="sm">{`Nothing is sent to ${other?.displayName ?? 'them'} about a private event.`}</Text>
          : <LetThemKnow />}
        <Button type="submit" style={BUTTON}>{event ? 'Save' : 'Add'}</Button>
      </Stack>
    </form>
  );
}

export function EventSheet({ opened, onClose, ...rest }: EventSheetProps) {
  return (
    <ResponsiveSheet opened={opened} onClose={onClose} title={title(rest.event)}>
      {opened && <Content onClose={onClose} {...rest} />}
    </ResponsiveSheet>
  );
}
