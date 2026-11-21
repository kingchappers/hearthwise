import { useState } from 'react';
import { Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { LoadError } from '~/components/layout/LoadError';
import { NewProjectSheet } from '~/components/projects/NewProjectSheet';
import { ProjectList } from '~/components/projects/ProjectList';
import { useProjectActions } from '~/hooks/useProjectActions';
import { pageTitle } from '~/lib/pageTitle';
import { useProjects } from '~/lib/projects';
import { COPY } from '~/lib/projectText';
import type { Route } from './+types/plan.projects._index';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Projects') }];

function ProjectsContent() {
  const projects = useProjects();
  const actions = useProjectActions();
  const [adding, setAdding] = useState(false);

  if (projects.status === 'loading') return <Loader aria-label="Loading projects" />;
  if (projects.status === 'error') return <LoadError thing="projects" onRetry={() => window.location.reload()} />;

  return (
    <Stack maw={640}>
      <Group justify="space-between" align="center">
        <Title order={1} size="h3">Projects</Title>
        <Button style={{ minHeight: 44 }} onClick={() => setAdding(true)}>{COPY.newProject}</Button>
      </Group>
      {projects.dataUpdatedAt === undefined && <Text size="sm">{COPY.notSavedForOffline}</Text>}
      <ProjectList projects={projects.projects} members={projects.members} me={projects.me} unsavedIds={projects.unsavedIds} />
      <NewProjectSheet opened={adding} onClose={() => setAdding(false)} actions={actions} />
    </Stack>
  );
}

export default function ProjectsPage() {
  return <ProjectsContent />;
}
