import { useState } from 'react';
import { Button, Stack, Textarea, TextInput } from '@mantine/core';
import type { Step } from '../../../src/projects/types';
import { MAX_STEP_NOTE, MAX_STEP_TEXT } from '../../../src/shared/projectValidation';
import type { ProjectActions } from '~/hooks/useProjectActions';
import type { StepChanges } from '~/lib/mutations';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';

function Form({ step, projectId, actions, onClose }: { step: Step; projectId: string; actions: Pick<ProjectActions, 'editStep' | 'deleteStep'>; onClose: () => void }) {
  const [text, setText] = useState(step.text);
  const [note, setNote] = useState(step.note ?? '');
  const trimmed = text.trim();
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (trimmed === '') return;
        // Only the fields the person changed are sent, so an untouched field cannot replace the other person's edit of it.
        const changes: StepChanges = {};
        if (trimmed !== step.text) changes.text = trimmed;
        if (note.trim() !== (step.note ?? '')) changes.note = note.trim() === '' ? null : note.trim();
        actions.editStep(projectId, step.id, changes);
        onClose();
      }}
    >
      <Stack>
        <TextInput label="Step" value={text} onChange={event => setText(event.currentTarget.value)} maxLength={MAX_STEP_TEXT} data-autofocus />
        <Textarea label="Note" value={note} onChange={event => setNote(event.currentTarget.value)} maxLength={MAX_STEP_NOTE} autosize minRows={2} />
        <Button type="submit" disabled={trimmed === ''} style={{ minHeight: 44 }}>Save</Button>
        <Button variant="default" style={{ minHeight: 44 }} onClick={() => { actions.deleteStep(projectId, step); onClose(); }}>Delete step</Button>
      </Stack>
    </form>
  );
}

export function StepSheet({ step, projectId, actions, onClose }: { step: Step | undefined; projectId: string; actions: Pick<ProjectActions, 'editStep' | 'deleteStep'>; onClose: () => void }) {
  return (
    <ResponsiveSheet opened={step !== undefined} onClose={onClose} title="Edit step">
      {step && <Form key={step.id} step={step} projectId={projectId} actions={actions} onClose={onClose} />}
    </ResponsiveSheet>
  );
}
