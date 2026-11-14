import { useState } from 'react';
import { Alert, Button, Group, NativeSelect, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { firstOnOrAfter } from '../../../src/shared/schedule';
import type { Repeat } from '../../../src/shared/schedule';
import type { ChecklistStep, Task } from '../../../src/tasks/types';
import { LetThemKnow } from '~/components/shared/LetThemKnow';
import { useTaskActions } from '~/hooks/useTaskActions';
import type { TaskChanges } from '~/lib/taskChanges';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';
import { RepeatPicker } from './RepeatPicker';

const MAX_TITLE = 120;
const MAX_STEP = 120;
const MAX_NOTES = 2000;
const MAX_STEPS = 30;

export interface TaskSheetProps {
  opened: boolean;
  onClose: () => void;
  // Edit this task; without one the sheet makes a new task.
  task?: Task;
}

function TaskForm({ task, onClose }: { task?: Task; onClose: () => void }) {
  const actions = useTaskActions();
  const { me, members, today } = actions;
  const other = members.find(member => member.userId !== me.userId);

  const [title, setTitle] = useState(task?.title ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [assignee, setAssignee] = useState(task?.assignee ?? 'either');
  const [repeat, setRepeat] = useState<Repeat>(task?.repeat ?? { type: 'none' });
  const [dueOn, setDueOn] = useState(task?.dueOn ?? '');
  const [steps, setSteps] = useState<ChecklistStep[]>(task?.checklist ?? []);
  const [error, setError] = useState<string | null>(null);

  const trimmedSteps = (): ChecklistStep[] => steps.map(step => ({ ...step, text: step.text.trim() })).filter(step => step.text !== '');

  // What differs from the saved task. A new task has no saved version: everything is new.
  function changes(): TaskChanges {
    const diff: TaskChanges = {};
    if (!task) return diff;
    if (title.trim() !== task.title) diff.title = title.trim();
    if (notes !== (task.notes ?? '')) diff.notes = notes;
    if (assignee !== task.assignee) diff.assignee = assignee;
    if (JSON.stringify(repeat) !== JSON.stringify(task.repeat)) diff.repeat = repeat;
    if (dueOn !== '' && (dueOn !== task.dueOn || diff.repeat !== undefined)) diff.dueOn = dueOn;
    if (JSON.stringify(trimmedSteps()) !== JSON.stringify(task.checklist)) diff.checklist = trimmedSteps();
    return diff;
  }

  const diff = changes();
  const asks = task
    ? (diff.assignee !== undefined && actions.needsAsk('assignee', task, { assignee: diff.assignee }))
      || ((diff.repeat !== undefined || diff.dueOn !== undefined) && actions.needsAsk('schedule', task))
    : actions.needsAsk('create', { assignee: 'either' }, { assignee });
  const swapped = task !== undefined && task.overrideAssignee !== undefined && task.overrideCycle === task.cycleSeq;

  function changeRepeat(next: Repeat): void {
    setRepeat(next);
    // The first date the new rule gives, on or after today, as a suggestion the person can change.
    if (next.type !== 'none') setDueOn(firstOnOrAfter(next, today));
  }

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    if (title.trim() === '') {
      setError('Give it a title');
      return;
    }
    if (task) {
      actions.save(task, diff);
    } else {
      actions.create({
        id: crypto.randomUUID(),
        title: title.trim(),
        ...(notes.trim() === '' ? {} : { notes }),
        assignee,
        repeat,
        ...(dueOn === '' ? {} : { dueOn }),
        ...(trimmedSteps().length === 0 ? {} : { checklist: trimmedSteps() }),
      });
    }
    onClose();
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Title" value={title} onChange={event => setTitle(event.currentTarget.value)} maxLength={MAX_TITLE} autoComplete="off" />
        <Textarea label="Notes" value={notes} onChange={event => setNotes(event.currentTarget.value)} maxLength={MAX_NOTES} autosize minRows={2} />
        <NativeSelect
          label="Who is it for?"
          value={assignee}
          onChange={event => setAssignee(event.currentTarget.value)}
          data={[
            { value: 'either', label: 'Anyone' },
            ...(other ? [{ value: 'both', label: 'Together' }] : []),
            { value: me.userId, label: 'You' },
            ...(other ? [{ value: other.userId, label: other.displayName }] : []),
          ]}
        />
        <RepeatPicker value={repeat} today={today} onChange={changeRepeat} />
        {swapped && diff.repeat !== undefined && <Alert color="honey"><Text>{`This cancels ${other?.displayName ?? 'their'}'s swap`}</Text></Alert>}
        <TextInput label="Due on" type="date" value={dueOn} onChange={event => setDueOn(event.currentTarget.value)} />
        <Stack gap="xs">
          {steps.map((step, index) => (
            <Group key={step.id} gap="xs" wrap="nowrap" align="flex-end">
              <TextInput
                style={{ flex: 1 }}
                label={`Step ${index + 1}`}
                value={step.text}
                maxLength={MAX_STEP}
                onChange={event => setSteps(steps.map(candidate => (candidate.id === step.id ? { ...candidate, text: event.currentTarget.value } : candidate)))}
              />
              <Button variant="default" aria-label={`Remove step ${index + 1}`} onClick={() => setSteps(steps.filter(candidate => candidate.id !== step.id))}>Remove</Button>
            </Group>
          ))}
          {steps.length < MAX_STEPS && (
            <Group><Button variant="default" onClick={() => setSteps([...steps, { id: crypto.randomUUID(), text: '' }])}>Add a step</Button></Group>
          )}
        </Stack>
        {error && <Alert color="honey" role="alert">{error}</Alert>}
        <LetThemKnow />
        <Button type="submit">{asks ? `Ask ${other?.displayName ?? 'them'}` : 'Save'}</Button>
      </Stack>
    </form>
  );
}

export function TaskSheet({ opened, onClose, task }: TaskSheetProps) {
  return (
    <ResponsiveSheet opened={opened} onClose={onClose} title={task ? 'Edit task' : 'New task'}>
      <TaskForm task={task} onClose={onClose} />
    </ResponsiveSheet>
  );
}
