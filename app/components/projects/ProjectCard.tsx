import { Card, Group, Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import type { ListedProject } from '~/lib/projects';
import type { MemberSummary } from '~/lib/household';
import { COPY, holderLine, stepsDone } from '~/lib/projectText';

// One project in the list: its title, how many steps are done, who is on it, and whether a write is waiting. Everything is in words.
export function ProjectCard({ project, members, me, unsaved }: { project: ListedProject; members: MemberSummary[]; me: string; unsaved: boolean }) {
  const holder = holderLine(project, members, me);
  const counts = project.counts && project.counts.steps > 0 ? stepsDone(project.counts.done, project.counts.steps) : undefined;
  return (
    <Card withBorder component={Link} to={`/plan/projects/${project.id}`} style={{ minHeight: 44, textDecoration: 'none', color: 'inherit' }}>
      <Stack gap={2}>
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text fw={600}>{project.title}</Text>
          {unsaved && <Text size="sm">{COPY.notSaved}</Text>}
        </Group>
        {counts && <Text size="sm">{counts}</Text>}
        {holder && <Text size="sm">{holder}</Text>}
      </Stack>
    </Card>
  );
}
