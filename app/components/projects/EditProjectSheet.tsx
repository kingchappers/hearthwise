import { useState } from 'react';
import { Button, Stack, Textarea, TextInput } from '@mantine/core';
import type { Project } from '../../../src/projects/types';
import { MAX_PROJECT_NOTES, MAX_PROJECT_TITLE } from '../../../src/shared/projectValidation';
import type { ProjectActions } from '~/hooks/useProjectActions';
import type { ProjectChanges } from '~/lib/mutations';
import { plannedChange } from '~/lib/projectForm';
import { COPY } from '~/lib/projectText';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';

function Form({ project, actions, onClose }: { project: Project; actions: Pick<ProjectActions, 'editProject'>; onClose: () => void }) {
  const [title, setTitle] = useState(project.title);
  const [notes, setNotes] = useState(project.notes ?? '');
  const [start, setStart] = useState(project.plannedOn ?? '');
  const [end, setEnd] = useState(project.plannedEndOn ?? '');
  const [endError, setEndError] = useState(false);
  const trimmed = title.trim();
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (trimmed === '') return;
        const changes: ProjectChanges = {};
        if (trimmed !== project.title) changes.title = trimmed;
        if (notes.trim() !== (project.notes ?? '')) changes.notes = notes.trim() === '' ? null : notes.trim();
        // The planned day is sent only when it changed, so an untouched day cannot replace the other person's edit of it.
        if (start !== (project.plannedOn ?? '') || end !== (project.plannedEndOn ?? '')) {
          const planned = plannedChange(start, end);
          if (!planned.ok) { setEndError(true); return; }
          changes.planned = planned.change;
        }
        actions.editProject(project.id, changes);
        onClose();
      }}
    >
      <Stack>
        <TextInput label="Title" value={title} onChange={event => setTitle(event.currentTarget.value)} maxLength={MAX_PROJECT_TITLE} data-autofocus />
        <Textarea label="Notes" value={notes} onChange={event => setNotes(event.currentTarget.value)} maxLength={MAX_PROJECT_NOTES} autosize minRows={3} />
        <TextInput label={COPY.plannedStart} type="date" value={start} onChange={event => setStart(event.currentTarget.value)} />
        <TextInput label={COPY.plannedEnd} type="date" value={end} onChange={event => setEnd(event.currentTarget.value)} error={endError ? COPY.plannedEndError : undefined} />
        {(start !== '' || end !== '') && <Button variant="default" style={{ minHeight: 44 }} onClick={() => { setStart(''); setEnd(''); setEndError(false); }}>{COPY.clearPlanned}</Button>}
        <Button type="submit" disabled={trimmed === ''} style={{ minHeight: 44 }}>Save</Button>
      </Stack>
    </form>
  );
}

export function EditProjectSheet({ project, opened, onClose, actions }: { project: Project; opened: boolean; onClose: () => void; actions: Pick<ProjectActions, 'editProject'> }) {
  return (
    <ResponsiveSheet opened={opened} onClose={onClose} title="Edit project">
      {opened && <Form project={project} actions={actions} onClose={onClose} />}
    </ResponsiveSheet>
  );
}
