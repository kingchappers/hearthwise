import { useMemo } from 'react';
import { useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Project } from '../../src/projects/types';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { useHousehold } from './household';
import type { MemberSummary } from './household';
import { projectKey, projectMutationKeys, projectsKey } from './projectKeys';
import { applyPendingProjectDetail, applyPendingProjectsList } from './projectOverlay';
import type { ProjectDetailData } from './projectOverlay';
import type { PendingMutation } from './overlay';
import { currentSettledCount } from './queries';
import type { MutationVars, ProjectMutationVars } from './mutations';

export { PROJECTS_KEY } from './projectKeys';
export type { ProjectDetailData };

const POLL_MS = 10_000;

export type StepCounts = { steps: number; done: number; materials: number };
export type ListedProject = Project & { counts?: StepCounts };

export interface ProjectsListData {
  projects: ListedProject[];
  deleted: ListedProject[];
  serverTime: number;
}

const NONE: ListedProject[] = [];

function usePendingProjects(): PendingMutation[] {
  const pending = useMutationState<PendingMutation>({
    filters: { status: 'pending', mutationKey: ['household'] },
    select: mutation => ({ mutationKey: mutation.options.mutationKey, variables: mutation.state.variables }),
  });
  return useMemo(() => pending.filter(mutation => typeof mutation.mutationKey?.[1] === 'string' && mutation.mutationKey[1] in projectMutationKeys), [pending]);
}

export interface ProjectsState {
  status: 'loading' | 'ready' | 'error';
  projects: ListedProject[];
  deleted: ListedProject[];
  me: string;
  members: MemberSummary[];
  // Ids that have a write waiting in the queue, shown as "Not saved yet".
  unsavedIds: ReadonlySet<string>;
  dataUpdatedAt: number | undefined;
}

// The household's projects as the person sees them: the server's list with every pending write laid over it, polled every 10 seconds
// while the app is visible. `counts: false` is the light read for Today and the calendar: it reads no step at all.
export function useProjects(options: { counts?: boolean } = {}): ProjectsState {
  const counts = options.counts ?? true;
  const { request } = useProtectedApi();
  const client = useQueryClient();
  const household = useHousehold();
  const pending = usePendingProjects();

  const query = useQuery({
    queryKey: projectsKey(counts),
    queryFn: async (): Promise<ProjectsListData> => {
      const startedAt = currentSettledCount();
      const fresh = await request(`/api/hh/projects${counts ? '' : '?counts=0'}`) as ProjectsListData;
      const previous = client.getQueryData<ProjectsListData>(projectsKey(counts));
      // A response that started before a write settled may not include it: keep what is on screen.
      return currentSettledCount() !== startedAt && previous ? previous : fresh;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const data = useMemo(() => (query.data ? applyPendingProjectsList(query.data, pending) : undefined), [query.data, pending]);
  const unsavedIds = useMemo(() => new Set(pending.flatMap(({ variables }) => idsOf(variables))), [pending]);
  return {
    status: data ? 'ready' : query.isError ? 'error' : 'loading',
    projects: data?.projects ?? NONE,
    deleted: data?.deleted ?? NONE,
    me: household.data?.me.userId ?? '',
    members: household.data?.members ?? [],
    unsavedIds,
    dataUpdatedAt: query.dataUpdatedAt || undefined,
  };
}

// The record ids a pending write is about: the project, the step, or each restored project.
export function idsOf(variables: unknown): string[] {
  const v = variables as Partial<ProjectMutationVars['putStep'] & ProjectMutationVars['restoreProject'] & ProjectMutationVars['putMaterial'] & ProjectMutationVars['materialsToList']> | undefined;
  if (!v) return [];
  return [v.projectId, v.stepId, v.lineId, ...(v.lineIds ?? []), ...(v.entries?.map(entry => entry.id) ?? [])].filter((id): id is string => id !== undefined);
}

export interface ProjectState {
  status: 'loading' | 'ready' | 'error' | 'notfound';
  data: ProjectDetailData | undefined;
  me: string;
  members: MemberSummary[];
  unsavedIds: ReadonlySet<string>;
  dataUpdatedAt: number | undefined;
}

// One project with its steps, polled every 10 seconds while its page is open. A project never opened online has nothing saved.
export function useProject(id: string): ProjectState {
  const { request } = useProtectedApi();
  const client = useQueryClient();
  const household = useHousehold();
  const pending = usePendingProjects();

  const query = useQuery({
    queryKey: projectKey(id),
    queryFn: async (): Promise<ProjectDetailData> => {
      const startedAt = currentSettledCount();
      const fresh = await request(`/api/hh/projects/${id}`) as ProjectDetailData;
      const previous = client.getQueryData<ProjectDetailData>(projectKey(id));
      return currentSettledCount() !== startedAt && previous ? previous : fresh;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: (count, error) => !(error as { status?: number }).status && count < 1,
  });

  const data = useMemo(() => (query.data ? applyPendingProjectDetail(query.data, pending) : undefined), [query.data, pending]);
  const unsavedIds = useMemo(() => new Set(pending.flatMap(({ variables }) => idsOf(variables))), [pending]);
  const missing = query.isError && (query.error as { status?: number }).status === 404;
  return {
    status: data ? 'ready' : missing ? 'notfound' : query.isError ? 'error' : 'loading',
    data,
    me: household.data?.me.userId ?? '',
    members: household.data?.members ?? [],
    unsavedIds,
    dataUpdatedAt: query.dataUpdatedAt || undefined,
  };
}

export type { MutationVars };
