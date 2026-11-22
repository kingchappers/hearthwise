import { useState } from 'react';
import { useDraftText } from '~/lib/textDrafts';
import { Button, Stack, TextInput } from '@mantine/core';
import { MAX_PROJECT_TITLE } from '../../../src/shared/projectValidation';
import type { ProjectActions } from '~/hooks/useProjectActions';
import { COPY } from '~/lib/projectText';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';
import { LetThemKnow } from '../shared/LetThemKnow';

// A title is enough. The id and the mutation id are made once, when the sheet opens, so a double tap is one project.
function Form({ onClose, actions }: { onClose: () => void; actions: Pick<ProjectActions, 'createProject' | 'me'> }) {
  const [ids] = useState(() => ({ id: crypto.randomUUID(), mutationId: crypto.randomUUID() }));
  const [title, setTitle, clearTitle] = useDraftText(actions.me, 'newproject:title');
  const trimmed = title.trim();
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (trimmed === '') return;
        actions.createProject({ ...ids, title: trimmed });
        clearTitle();
        onClose();
      }}
    >
      <Stack>
        <TextInput label="Title" value={title} onChange={event => setTitle(event.currentTarget.value)} maxLength={MAX_PROJECT_TITLE} data-autofocus />
        <LetThemKnow />
        <Button type="submit" disabled={trimmed === ''} style={{ minHeight: 44 }}>{COPY.addProject}</Button>
      </Stack>
    </form>
  );
}

export function NewProjectSheet({ opened, onClose, actions }: { opened: boolean; onClose: () => void; actions: Pick<ProjectActions, 'createProject' | 'me'> }) {
  return (
    <ResponsiveSheet opened={opened} onClose={onClose} title={COPY.newProject}>
      {opened && <Form onClose={onClose} actions={actions} />}
    </ResponsiveSheet>
  );
}
