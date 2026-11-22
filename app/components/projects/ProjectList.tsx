import { Stack, Text, Title } from '@mantine/core';
import type { ListedProject } from '~/lib/projects';
import type { MemberSummary } from '~/lib/household';
import { COPY } from '~/lib/projectText';
import { ProjectCard } from './ProjectCard';

// Active projects, then the finished ones under "Finished". A finished project can be found and brought back from its page.
export function ProjectList({ projects, members, me, unsavedIds, relativeFrom }: { projects: ListedProject[]; members: MemberSummary[]; me: string; unsavedIds: ReadonlySet<string>; relativeFrom?: string }) {
  const active = projects.filter(project => project.status === 'active');
  const finished = projects.filter(project => project.status === 'finished');
  if (projects.length === 0) return <Text>{COPY.empty}</Text>;
  const cards = (rows: ListedProject[]) => rows.map(project => <ProjectCard key={project.id} project={project} members={members} me={me} unsaved={unsavedIds.has(project.id)} relativeFrom={relativeFrom} />);
  return (
    <Stack>
      {cards(active)}
      {finished.length > 0 && (
        <Stack component="section" aria-labelledby="finished-projects">
          <Title order={2} size="h4" id="finished-projects">{COPY.finished}</Title>
          {cards(finished)}
        </Stack>
      )}
    </Stack>
  );
}
