import { useState } from 'react';
import { useDraftText } from '~/lib/textDrafts';
import { EnergyPicker } from '~/components/shared/EnergyPicker';
import type { Energy } from '../../../src/shared/energy';
import { Button, Stack, Text, Textarea, TextInput } from '@mantine/core';
import type { Step } from '../../../src/projects/types';
import { MAX_STEP_NOTE, MAX_STEP_TEXT } from '../../../src/shared/projectValidation';
import type { ProjectActions } from '~/hooks/useProjectActions';
import type { StepChanges } from '~/lib/mutations';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';

function Form({ step, projectId, actions, onClose, userId }: { step: Step; projectId: string; actions: Pick<ProjectActions, 'editStep' | 'deleteStep'>; onClose: () => void; userId: string }) {
  // Kept on this device until saved, so a tap outside or Escape does not lose a half-typed note.
  const [text, setText, clearText] = useDraftText(userId, `step:${step.id}:text`, step.text);
  const [note, setNote, clearNote] = useDraftText(userId, `step:${step.id}:note`, step.note ?? '');
  const [energy, setEnergy] = useState<Energy | undefined>(step.energy);
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
        if (energy !== step.energy) changes.energy = energy ?? null;
        actions.editStep(projectId, step.id, changes);
        clearText();
        clearNote();
        onClose();
      }}
    >
      <Stack>
        <TextInput label="Step" value={text} onChange={event => setText(event.currentTarget.value)} maxLength={MAX_STEP_TEXT} data-autofocus />
        <Textarea label="Note" description="Why or how. The other person sees this under the step." value={note} onChange={event => setNote(event.currentTarget.value)} maxLength={MAX_STEP_NOTE} autosize minRows={2} />
        <EnergyPicker value={energy} onChange={setEnergy} />
        <Text size="sm">If you both change a step, the later save is kept. If yours is replaced, your words are kept for you.</Text>
        <Button type="submit" disabled={trimmed === ''} style={{ minHeight: 44 }}>Save</Button>
        <Button variant="default" style={{ minHeight: 44 }} onClick={() => { actions.deleteStep(projectId, step); onClose(); }}>Delete step</Button>
      </Stack>
    </form>
  );
}

export function StepSheet({ step, projectId, actions, onClose, userId = '' }: { step: Step | undefined; projectId: string; actions: Pick<ProjectActions, 'editStep' | 'deleteStep'>; onClose: () => void; userId?: string }) {
  return (
    <ResponsiveSheet opened={step !== undefined} onClose={onClose} title="Edit step">
      {step && <Form key={step.id} step={step} projectId={projectId} actions={actions} onClose={onClose} userId={userId} />}
    </ResponsiveSheet>
  );
}
