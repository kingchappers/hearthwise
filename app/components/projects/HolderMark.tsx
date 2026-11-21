import { Text } from '@mantine/core';
import type { MemberSummary } from '~/lib/household';
import { holderLine, onItFor } from '~/lib/projectText';

// Who is on a step or project, in words. The words carry the meaning; nothing here depends on colour. A holder who has left reads as
// nobody, so nothing shows a name that no longer belongs to the household.
export function HolderMark({ record, members, me, now }: { record: { takenBy?: string; takenAt?: number }; members: MemberSummary[]; me: string; now: number }) {
  const line = holderLine(record, members, me);
  if (line === undefined) return null;
  const age = onItFor(record.takenAt, now);
  return <Text size="sm">{line}{age ? `. ${age}` : ''}</Text>;
}
