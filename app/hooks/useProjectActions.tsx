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
  deleteProject(project: { id: string; title: string }): void;
  restoreProject(project: { id: string; deletedAt: number; title?: string }): void;
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
      if (Object.keys(changes).length === 0) return;
      put.mutate({ ...common(), projectId, changes });
      // A change of state says so where it happened, not only by a button changing its label.
      if (changes.status === 'finished') toast('Marked as finished. You can bring it back any time.');
      else if (changes.status === 'active') toast('Brought back. It is in your active projects.');
    },
    // Where it went is said at once: a deleted project is in Deleted for 30 days. (An Undo here would need the server's deletion time,
    // which is only known once the delete has landed, so the way back is Restore on the Deleted page.)
    deleteProject: ({ id, title }) => {
      del.mutate({ ...common(), projectId: id });
      toast(`Deleted: ${title}. You can bring it back from Deleted for 30 days.`);
    },
    restoreProject: ({ id, deletedAt, title }) => {
      restore.mutate({ ...plain(), entries: [{ id, deletedAt }] });
      toast(title === undefined ? 'Restored. It is in Projects.' : `Restored: ${title}. It is in Projects.`);
    },
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

