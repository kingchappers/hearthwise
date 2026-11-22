import { useState } from 'react';
import { useDraftText } from '~/lib/textDrafts';
import { Button, Stack, Text, Textarea } from '@mantine/core';
import type { Step } from '../../../src/projects/types';
import type { ProjectActions } from '~/hooks/useProjectActions';
import { positionsForLines, splitLines } from '~/lib/projectForm';
import { COPY } from '~/lib/projectText';

// One step for each line, so rough notes or a pasted list become steps. Each is placed after the last one.
export function AddSteps({ projectId, steps, actions, userId = '' }: { projectId: string; steps: Step[]; actions: Pick<ProjectActions, 'addSteps'>; userId?: string }) {
  // Kept on this device until the steps are added, so leaving the page does not lose a list that was half typed.
  const [text, setText, clearText] = useDraftText(userId, `steps:${projectId}`);
  const [refused, setRefused] = useState(false);
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        const lines = splitLines(text);
        if (lines.length === 0) return;
        const placed = positionsForLines(steps, lines);
        if (!placed) { setRefused(true); return; }
        setRefused(false);
        actions.addSteps(projectId, placed);
        setText('');
        clearText();
      }}
    >
      <Stack gap="xs">
        <Textarea label={COPY.addStep} description={COPY.addStepHint} value={text} onChange={event => setText(event.currentTarget.value)} autosize minRows={2} />
        {refused && <Text size="sm" role="status">{COPY.noRoom}</Text>}
        <Button type="submit" disabled={text.trim() === ''} style={{ minHeight: 44 }}>{COPY.addStep}</Button>
      </Stack>
    </form>
  );
}
