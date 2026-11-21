import { useState } from 'react';
import { Button, Stack, Textarea, TextInput } from '@mantine/core';
import type { Project } from '../../../src/projects/types';
import { MAX_PROJECT_NOTES, MAX_PROJECT_TITLE } from '../../../src/shared/projectValidation';
import type { ProjectActions } from '~/hooks/useProjectActions';
import type { ProjectChanges } from '~/lib/mutations';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';

function Form({ project, actions, onClose }: { project: Project; actions: Pick<ProjectActions, 'editProject'>; onClose: () => void }) {
  const [title, setTitle] = useState(project.title);
  const [notes, setNotes] = useState(project.notes ?? '');
  const trimmed = title.trim();
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (trimmed === '') return;
        const changes: ProjectChanges = {};
        if (trimmed !== project.title) changes.title = trimmed;
        if (notes.trim() !== (project.notes ?? '')) changes.notes = notes.trim() === '' ? null : notes.trim();
        actions.editProject(project.id, changes);
        onClose();
      }}
    >
      <Stack>
        <TextInput label="Title" value={title} onChange={event => setTitle(event.currentTarget.value)} maxLength={MAX_PROJECT_TITLE} data-autofocus />
        <Textarea label="Notes" value={notes} onChange={event => setNotes(event.currentTarget.value)} maxLength={MAX_PROJECT_NOTES} autosize minRows={3} />
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
