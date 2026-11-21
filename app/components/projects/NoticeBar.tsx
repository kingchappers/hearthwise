import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import { dismissNotice } from '~/lib/projectNotices';
import type { ProjectNotice } from '~/lib/projectNotices';
import { COPY } from '~/lib/projectText';

// What happened to a person's own edit or take, kept until they dismiss it. A replaced edit keeps their words so they can copy them.
export function NoticeBar({ notices, userId }: { notices: ProjectNotice[]; userId: string }) {
  if (notices.length === 0) return null;
  return (
    <Stack gap="xs" role="status">
      {notices.map(notice => (
        <Alert key={notice.id} color="honey" variant="light">
          <Text size="sm">{notice.kind === 'replaced' ? COPY.replaced : notice.text}</Text>
          {notice.kind === 'replaced' && <Text size="sm" fw={600} style={{ whiteSpace: 'pre-wrap' }}>{notice.text}</Text>}
          <Group gap="xs" mt="xs">
            {notice.kind === 'replaced' && (
              <Button variant="default" size="xs" style={{ minHeight: 44 }} onClick={() => { void navigator.clipboard?.writeText(notice.text); }}>{COPY.copy}</Button>
            )}
            <Button variant="default" size="xs" style={{ minHeight: 44 }} onClick={() => dismissNotice(userId, notice.id)}>{COPY.dismiss}</Button>
          </Group>
        </Alert>
      ))}
    </Stack>
  );
}
