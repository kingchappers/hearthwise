import { Button, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { Material, Step } from '../../src/projects/types';
import { useHousehold } from '~/lib/household';
import { notifyFields } from '~/lib/letThemKnow';
import { useProjectMutation } from '~/lib/mutations';
import { COPY } from '~/lib/projectText';
import type { ProjectChanges, StepChanges } from '~/lib/mutations';

export interface ProjectActions {
  me: string;
  // The sheet makes `id` and `mutationId` once, when it opens, so a double tap is one project.
  createProject(input: { id: string; mutationId: string; title: string }): void;
  editProject(projectId: string, changes: ProjectChanges): void;
  deleteProject(projectId: string): void;
  restoreProject(project: { id: string; deletedAt: number }): void;
  takeProject(projectId: string): void;
  releaseProject(projectId: string): void;
  // Each step is its own write; the "Let them know" tick goes with the first only, so one paste is one push.
  addSteps(projectId: string, steps: { text: string; position: string }[]): void;
  editStep(projectId: string, stepId: string, changes: StepChanges): void;
  deleteStep(projectId: string, step: Step): void;
  // Undo of a delete is a new step with the same words under a new id: a held or done step comes back not started.
  undoDeleteStep(projectId: string, step: Step): void;
  takeStep(projectId: string, stepId: string): void;
  releaseStep(projectId: string, stepId: string): void;
  // Each pasted line is its own write; the tick goes with the first only.
  addMaterials(projectId: string, lines: string[]): void;
  editMaterial(projectId: string, lineId: string, text: string): void;
  deleteMaterial(projectId: string, material: Material): void;
  undoDeleteMaterial(projectId: string, material: Material): void;
  copyToList(projectId: string, lineIds: string[]): void;
}

// Every project action the screens can take: each builds its mutation's variables (an id, the time of the tap, who made it, and the
// "Let them know" tick) and runs it by key.
export function useProjectActions(): ProjectActions {
  const household = useHousehold();
  const put = useProjectMutation('putProject');
  const del = useProjectMutation('deleteProject');
  const restore = useProjectMutation('restoreProject');
  const takeP = useProjectMutation('takeProject');
  const releaseP = useProjectMutation('releaseProject');
  const putStep = useProjectMutation('putStep');
  const delStep = useProjectMutation('deleteStep');
  const takeS = useProjectMutation('takeStep');
  const releaseS = useProjectMutation('releaseStep');
  const putMat = useProjectMutation('putMaterial');
  const delMat = useProjectMutation('deleteMaterial');
  const toList = useProjectMutation('materialsToList');

  const me = household.data?.me.userId ?? '';
  const common = () => ({ mutationId: crypto.randomUUID(), at: Date.now(), by: me, ...notifyFields() });
  const plain = () => ({ mutationId: crypto.randomUUID(), at: Date.now(), by: me });
  const toast = (message: React.ReactNode): void => { notifications.show({ id: crypto.randomUUID(), autoClose: 8000, message }); };
  const undoDeleteStep = (projectId: string, step: Step): void => putStep.mutate({
    ...plain(), projectId, stepId: crypto.randomUUID(),
    changes: { text: step.text, position: step.position, ...(step.note === undefined ? {} : { note: step.note }) },
  });

  return {
    me,
    createProject: ({ id, mutationId, title }) => put.mutate({ ...common(), mutationId, projectId: id, changes: { title } }),
    editProject: (projectId, changes) => {
      if (Object.keys(changes).length > 0) put.mutate({ ...common(), projectId, changes });
    },
    deleteProject: projectId => del.mutate({ ...common(), projectId }),
    restoreProject: ({ id, deletedAt }) => restore.mutate({ ...plain(), entries: [{ id, deletedAt }] }),
    takeProject: projectId => takeP.mutate({ ...common(), projectId }),
    releaseProject: projectId => releaseP.mutate({ ...common(), projectId }),
    addSteps: (projectId, steps) => steps.forEach(({ text, position }, index) => {
      putStep.mutate({ ...(index === 0 ? common() : plain()), projectId, stepId: crypto.randomUUID(), changes: { text, position } });
    }),
    editStep: (projectId, stepId, changes) => {
      if (Object.keys(changes).length > 0) putStep.mutate({ ...common(), projectId, stepId, changes });
    },
    deleteStep: (projectId, step) => {
      delStep.mutate({ ...common(), projectId, stepId: step.id });
      // The step's words are kept in this toast for as long as it shows; Undo writes them again under a new id.
      toast(
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">Step deleted</Text>
          <Button variant="default" size="xs" style={{ minHeight: 44 }} onClick={() => undoDeleteStep(projectId, step)}>{COPY.undo}</Button>
        </Group>,
      );
    },
    undoDeleteStep,
    takeStep: (projectId, stepId) => takeS.mutate({ ...common(), projectId, stepId }),
    releaseStep: (projectId, stepId) => releaseS.mutate({ ...common(), projectId, stepId }),
    addMaterials: (projectId, lines) => lines.forEach((text, index) => {
      putMat.mutate({ ...(index === 0 ? common() : plain()), projectId, lineId: crypto.randomUUID(), text });
    }),
    editMaterial: (projectId, lineId, text) => putMat.mutate({ ...common(), projectId, lineId, text }),
    deleteMaterial: (projectId, material) => {
      delMat.mutate({ ...common(), projectId, lineId: material.id });
      toast(
        <Group justify="space-between" wrap="nowrap">
          <Text size="sm">Line deleted</Text>
          <Button variant="default" size="xs" style={{ minHeight: 44 }} onClick={() => putMat.mutate({ ...plain(), projectId, lineId: crypto.randomUUID(), text: material.text })}>{COPY.undo}</Button>
        </Group>,
      );
    },
    undoDeleteMaterial: (projectId, material) => putMat.mutate({ ...plain(), projectId, lineId: crypto.randomUUID(), text: material.text }),
    copyToList: (projectId, lineIds) => toList.mutate({ ...common(), projectId, lineIds }),
  };
}

