import { useState } from 'react';
import { Button, Group, List, Stack, Text, Title } from '@mantine/core';
import type { Step } from '../../../src/projects/types';
import type { ProjectActions } from '~/hooks/useProjectActions';
import { positionFor } from '~/lib/projectForm';
import type { ProjectDetailData } from '~/lib/projectOverlay';
import type { ProjectNotice } from '~/lib/projectNotices';
import { COPY, holderLine, lastChangedBy, nameOf, plannedText } from '~/lib/projectText';
import type { MemberSummary } from '~/lib/household';
import { LetThemKnow } from '../shared/LetThemKnow';
import { AddSteps } from './AddSteps';
import { MaterialsSection } from './MaterialsSection';
import { EditProjectSheet } from './EditProjectSheet';
import { NoticeBar } from './NoticeBar';
import { StepRow } from './StepRow';
import { StepSheet } from './StepSheet';

const NO_LIST: ReadonlyMap<string, 'onList' | 'cleared'> = new Map();

export interface ProjectPageProps {
  data: ProjectDetailData;
  me: string;
  members: MemberSummary[];
  now: number;
  unsavedIds: ReadonlySet<string>;
  notices: ProjectNotice[];
  // Where each material's shopping item stands, so a material can say "On the list".
  listState?: ReadonlyMap<string, 'onList' | 'cleared'>;
  actions: ProjectActions;
  onBack: () => void;
}

// One project: its title, the steps in order, and what can be done with them. Either person can add, edit, reorder, tick and take; there
// is no lock and nothing waits for approval.
export function ProjectPage({ data, me, members, now, unsavedIds, notices, listState = NO_LIST, actions, onBack }: ProjectPageProps) {
  const { project, steps, materials } = data;
  const [editing, setEditing] = useState<Step | undefined>(undefined);
  const [editingProject, setEditingProject] = useState(false);
  const [noRoom, setNoRoom] = useState(false);
  const holder = holderLine(project, members, me);
  const iHold = project.takenBy === me;
  const deleted = project.deletedAt !== undefined;

  const move = (step: Step, direction: 'up' | 'down') => {
    const position = positionFor(steps, { type: direction, id: step.id });
    if (position === undefined) { setNoRoom(true); return; }
    setNoRoom(false);
    actions.editStep(project.id, step.id, { position });
  };

  return (
    <Stack maw={640}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Title order={1} size="h3">{project.title}</Title>
        <Button variant="subtle" style={{ minHeight: 44 }} onClick={onBack}>All projects</Button>
      </Group>
      {unsavedIds.has(project.id) && <Text size="sm" role="status">{COPY.notSaved}</Text>}
      {deleted && <Text role="status">{COPY.deletedProject}</Text>}
      <NoticeBar notices={notices} userId={me} />

      {!deleted && (
        <>
          {project.plannedOn !== undefined && <Text>{plannedText({ plannedOn: project.plannedOn, plannedEndOn: project.plannedEndOn })}</Text>}
          {holder && <Text>{holder}</Text>}
          <Group gap="xs">
            {iHold
              ? <Button variant="default" style={{ minHeight: 44 }} onClick={() => actions.releaseProject(project.id)}>{COPY.freeProject}</Button>
              : project.takenBy === undefined || holder === undefined
                ? <Button variant="default" style={{ minHeight: 44 }} aria-label={`${COPY.takeIt}: the whole project`} onClick={() => actions.takeProject(project.id)}>{COPY.takeIt}</Button>
                : null}
            <Button variant="default" style={{ minHeight: 44 }} onClick={() => actions.editProject(project.id, { status: project.status === 'finished' ? 'active' : 'finished' })}>
              {project.status === 'finished' ? COPY.bringBack : COPY.finish}
            </Button>
            <Button variant="default" style={{ minHeight: 44 }} onClick={() => setEditingProject(true)}>Edit project</Button>
          </Group>
          {project.notes && <Text style={{ whiteSpace: 'pre-wrap' }}>{project.notes}</Text>}
          {project.updatedBy !== me && nameOf(members, project.updatedBy) && <Text size="sm">{lastChangedBy(nameOf(members, project.updatedBy) as string)}</Text>}
          <LetThemKnow />

          <Title order={2} size="h4">Steps</Title>
          {noRoom && <Text size="sm" role="status">{COPY.noRoom}</Text>}
          {steps.length === 0
            ? <Text>{COPY.noSteps}</Text>
            : (
              <List listStyleType="none" m={0} p={0} component="ol" aria-label="Steps in order">
                {steps.map((step, index) => (
                  <StepRow
                    key={step.id} step={step} projectId={project.id} members={members} me={me} now={now} unsaved={unsavedIds.has(step.id)}
                    first={index === 0} last={index === steps.length - 1} actions={actions} onMove={move} onOpen={setEditing}
                  />
                ))}
              </List>
            )}
          <AddSteps projectId={project.id} steps={steps} actions={actions} />
          <MaterialsSection projectId={project.id} materials={materials} unsavedIds={unsavedIds} listState={listState} actions={actions} />
          <Button variant="default" style={{ minHeight: 44 }} onClick={() => { actions.deleteProject(project.id); onBack(); }}>Delete project</Button>
        </>
      )}

      <StepSheet step={editing} projectId={project.id} actions={actions} onClose={() => setEditing(undefined)} />
      <EditProjectSheet project={project} opened={editingProject} onClose={() => setEditingProject(false)} actions={actions} />
    </Stack>
  );
}
