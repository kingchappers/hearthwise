// The query keys and mutation keys for projects. Kept apart from `projects.ts` so the mutation registry can name them without importing
// hooks. A key is never renamed once shipped: a saved write is replayed by its key.
export const PROJECTS_KEY = ['projects'] as const;
export const projectsKey = (counts: boolean) => [...PROJECTS_KEY, { counts }] as const;
export const projectKey = (id: string) => ['project', id] as const;
export const PROJECT_KEY_PREFIX = ['project'] as const;

export type ProjectMutationKind =
  | 'putProject' | 'deleteProject' | 'restoreProject' | 'takeProject' | 'releaseProject'
  | 'putStep' | 'deleteStep' | 'takeStep' | 'releaseStep'
  | 'putMaterial' | 'deleteMaterial' | 'materialsToList';

export const projectMutationKeys: { [K in ProjectMutationKind]: readonly ['household', K] } = {
  putProject: ['household', 'putProject'], deleteProject: ['household', 'deleteProject'], restoreProject: ['household', 'restoreProject'],
  takeProject: ['household', 'takeProject'], releaseProject: ['household', 'releaseProject'],
  putStep: ['household', 'putStep'], deleteStep: ['household', 'deleteStep'], takeStep: ['household', 'takeStep'], releaseStep: ['household', 'releaseStep'],
  putMaterial: ['household', 'putMaterial'], deleteMaterial: ['household', 'deleteMaterial'], materialsToList: ['household', 'materialsToList'],
};
