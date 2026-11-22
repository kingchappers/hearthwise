import { Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import type { ComingItem, ProjectLine } from '~/lib/comingUp';
import { withRelative } from '~/lib/relativeTime';

export interface ComingUpProps {
  items: ComingItem[];
  projects: ProjectLine[];
  today: string;
  // Adds how far away each day is, if the person asked for that in Settings.
  relative?: boolean;
}

const ROW = { display: 'block', minHeight: 44, paddingBlock: 6, color: 'inherit', textDecoration: 'none' } as const;

// A short look ahead on Today: the next calendar things, and a project line only when there is something to notice. It says nothing at
// all when there is nothing to say, so a quiet week does not add a card.
export function ComingUp({ items, projects, today, relative = false }: ComingUpProps) {
  if (items.length === 0 && projects.length === 0) return null;
  return (
    <Stack component="section" gap={4} aria-labelledby="coming-up-heading">
      <Title order={2} size="h5" id="coming-up-heading">Coming up</Title>
      <ul style={{ margin: 0, padding: 0 }}>
        {items.map(item => (
          <li key={item.key} style={{ listStyle: 'none' }}>
            <Link to="/plan/calendar" style={ROW}>
              <Text fw={600}>{[withRelative(item.dayText, item.day, today, relative), item.time].filter(Boolean).join(', ')}</Text>
              <Text size="sm">{[item.label, item.who].filter(Boolean).join(' · ')}</Text>
            </Link>
          </li>
        ))}
        {projects.map(project => (
          <li key={project.id} style={{ listStyle: 'none' }}>
            <Link to={`/plan/projects/${project.id}`} style={ROW}><Text>{project.text}</Text></Link>
          </li>
        ))}
      </ul>
    </Stack>
  );
}
