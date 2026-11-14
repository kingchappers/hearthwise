import { Stack, Text } from '@mantine/core';
import type { TaskHistoryData } from '~/lib/history';
import { memberName } from '~/lib/taskText';
import type { NamedMember } from '~/lib/taskText';

const dateOf = (ms: number): string => new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export interface TaskHistoryProps {
  history: TaskHistoryData;
  roster: NamedMember[];
  viewerId: string;
}

export function TaskHistory({ history, roster }: TaskHistoryProps) {
  if (history.completions.length === 0 && history.edits.length === 0) return <Text>Nothing has happened to this yet.</Text>;
  return (
    <Stack gap="sm">
      <ul style={{ margin: 0, padding: 0 }}>
        {history.completions.map(completion => (
          <li key={`done-${completion.cycleSeq}`} style={{ listStyle: 'none' }}>
            <Stack gap={0} py={4}>
              <Text fw={600}>{`Done by ${memberName(roster, completion.by[0]?.userId ?? '')}`}</Text>
              {completion.together && <Text size="sm">Together</Text>}
              {completion.by.slice(1).map(other => (
                <Text key={other.userId} size="sm">{`Also did it: ${memberName(roster, other.userId)}`}</Text>
              ))}
              {completion.by[0] && <Text size="sm">{dateOf(completion.by[0].at)}</Text>}
            </Stack>
          </li>
        ))}
        {history.edits.map(edit => (
          <li key={`edit-${edit.at}`} style={{ listStyle: 'none' }}>
            <Stack gap={0} py={4}>
              <Text>{`${memberName(roster, edit.byUserId)} changed the ${edit.fields.join(' and ')}`}</Text>
              <Text size="sm">{dateOf(edit.at)}</Text>
            </Stack>
          </li>
        ))}
      </ul>
    </Stack>
  );
}
