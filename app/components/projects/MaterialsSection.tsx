import { useState } from 'react';
import { Button, List, Stack, Text, Textarea, Title } from '@mantine/core';
import type { Material } from '../../../src/projects/types';
import type { ProjectActions } from '~/hooks/useProjectActions';
import { splitLines } from '~/lib/projectForm';
import { COPY } from '~/lib/projectText';
import { MaterialRow } from './MaterialRow';

export interface MaterialsSectionProps {
  projectId: string;
  materials: Material[];
  unsavedIds: ReadonlySet<string>;
  // Where each material's shopping item stands, by id, read from the list the app already has.
  listState: ReadonlyMap<string, 'onList' | 'cleared'>;
  actions: Pick<ProjectActions, 'addMaterials' | 'editMaterial' | 'deleteMaterial' | 'copyToList'>;
}

// Shown once there are lines or the person asks for it ("Add materials"). The copy to the shopping list is one press for every line:
// the server skips any that are already there, so pressing it twice adds nothing.
export function MaterialsSection({ projectId, materials, unsavedIds, listState, actions }: MaterialsSectionProps) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (materials.length === 0 && !open) {
    return <Button variant="default" style={{ minHeight: 44 }} onClick={() => setOpen(true)}>{COPY.addMaterials}</Button>;
  }
  const toCopy = materials.filter(material => !unsavedIds.has(material.id));
  return (
    <Stack component="section" aria-labelledby="materials-heading" gap="xs">
      <Title order={2} size="h4" id="materials-heading">{COPY.materials}</Title>
      {materials.length > 0 && (
        <List listStyleType="none" m={0} p={0} component="ul" aria-label="Materials">
          {materials.map(material => (
            <MaterialRow key={material.id} material={material} projectId={projectId} unsaved={unsavedIds.has(material.id)} listState={listState.get(material.id)} actions={actions} />
          ))}
        </List>
      )}
      <form
        onSubmit={event => {
          event.preventDefault();
          const lines = splitLines(text);
          if (lines.length === 0) return;
          actions.addMaterials(projectId, lines);
          setText('');
        }}
      >
        <Stack gap="xs">
          <Textarea label={COPY.addMaterials} description={COPY.addMaterialsHint} value={text} onChange={event => setText(event.currentTarget.value)} autosize minRows={2} />
          <Button type="submit" disabled={text.trim() === ''} style={{ minHeight: 44 }}>{COPY.addMaterials}</Button>
        </Stack>
      </form>
      {materials.length > 0 && (
        <>
          <Button style={{ minHeight: 44 }} disabled={toCopy.length === 0} onClick={() => actions.copyToList(projectId, toCopy.map(material => material.id))}>{COPY.addToList}</Button>
          <Text size="sm">Lines already on the list are left as they are, so pressing this twice adds nothing.</Text>
        </>
      )}
    </Stack>
  );
}
