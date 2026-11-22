import { useMemo } from 'react';
import { Alert, Button, Loader, Stack, Text } from '@mantine/core';
import { useNavigate } from 'react-router';
import { LoadError } from '~/components/layout/LoadError';
import { ProjectPage } from '~/components/projects/ProjectPage';
import { useProjectActions } from '~/hooks/useProjectActions';
import { useItems } from '~/lib/items';
import { pageTitle } from '~/lib/pageTitle';
import { useProjectNotices } from '~/lib/projectNotices';
import { useProject } from '~/lib/projects';
import { COPY } from '~/lib/projectText';
import { useNow } from '~/lib/useNow';
import type { Route } from './+types/plan.projects.$id';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Project') }];

function ProjectContent({ id }: { id: string }) {
  const project = useProject(id);
  const actions = useProjectActions();
  const notices = useProjectNotices(project.me, id);
  const navigate = useNavigate();
  const now = useNow();
  const items = useItems();
  const listState = useMemo(() => new Map(items.items.map(item => [item.id, item.deletedAt === undefined ? 'onList' as const : 'cleared' as const])), [items.items]);

  if (project.status === 'loading') return <Loader aria-label="Loading project" />;
  if (project.status === 'notfound') {
    return (
      <Stack maw={640}>
        <Text>{COPY.gone}</Text>
        <Button style={{ minHeight: 44 }} onClick={() => { void navigate('/plan/projects'); }}>All projects</Button>
      </Stack>
    );
  }
  if (project.status === 'error' || !project.data) {
    // Never opened while online: nothing is saved for it yet. The app never says a project is gone from this alone.
    return project.dataUpdatedAt === undefined
      ? <Alert color="honey"><Text>{COPY.notSavedForOffline}</Text></Alert>
      : <LoadError thing="project" onRetry={() => window.location.reload()} />;
  }
  return (
    <ProjectPage
      data={project.data} me={project.me} members={project.members} now={now} unsavedIds={project.unsavedIds} notices={notices} listState={listState} relativeFrom={project.relativeFrom}
      actions={actions} onBack={() => { void navigate('/plan/projects'); }}
    />
  );
}

export default function ProjectRoute({ params }: Route.ComponentProps) {
  return <ProjectContent id={params.id} />;
}
