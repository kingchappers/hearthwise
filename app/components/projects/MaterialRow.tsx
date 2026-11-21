import { useState } from 'react';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import type { Material } from '../../../src/projects/types';
import { MAX_MATERIAL_TEXT } from '../../../src/shared/projectValidation';
import type { ProjectActions } from '~/hooks/useProjectActions';
import { COPY } from '~/lib/projectText';

export interface MaterialRowProps {
  material: Material;
  projectId: string;
  unsaved: boolean;
  // Read on this phone from the shopping list the app already has: on the list now, or on it once and since cleared.
  listState?: 'onList' | 'cleared';
  actions: Pick<ProjectActions, 'editMaterial' | 'deleteMaterial'>;
}

// One line of materials: its words, whether it is on the shopping list, and edit and delete. Nothing is read or scaled: a line is text.
export function MaterialRow({ material, projectId, unsaved, listState, actions }: MaterialRowProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(material.text);
  const trimmed = text.trim();
  if (editing) {
    return (
      <form
        onSubmit={event => {
          event.preventDefault();
          if (trimmed !== '' && trimmed !== material.text) actions.editMaterial(projectId, material.id, trimmed);
          setEditing(false);
        }}
      >
        <Group align="flex-end" wrap="nowrap" gap="xs">
          <TextInput label="Material" value={text} onChange={event => setText(event.currentTarget.value)} maxLength={MAX_MATERIAL_TEXT} style={{ flex: 1 }} data-autofocus />
          <Button type="submit" style={{ minHeight: 44 }} disabled={trimmed === ''}>Save</Button>
        </Group>
      </form>
    );
  }
  return (
    <Stack gap={2} component="li" style={{ listStyle: 'none', paddingBlock: 6 }}>
      <Text style={{ overflowWrap: 'anywhere' }}>{material.text}</Text>
      {(listState || unsaved) && <Text size="sm">{[listState === 'onList' ? COPY.onTheList : listState === 'cleared' ? COPY.clearedFromList : undefined, unsaved ? COPY.notSaved : undefined].filter(Boolean).join('. ')}</Text>}
      <Group gap="xs">
        <Button variant="subtle" size="xs" style={{ minHeight: 44 }} aria-label={`Edit: ${material.text}`} onClick={() => { setText(material.text); setEditing(true); }}>Edit</Button>
        <Button variant="subtle" size="xs" style={{ minHeight: 44 }} aria-label={`Delete line: ${material.text}`} onClick={() => actions.deleteMaterial(projectId, material)}>Delete line</Button>
      </Group>
    </Stack>
  );
}
