import { Button, Checkbox, Group, Stack, Text } from '@mantine/core';
import type { Step } from '../../../src/projects/types';
import { holderOf } from '../../../src/shared/projectRules';
import type { ProjectActions } from '~/hooks/useProjectActions';
import type { MemberSummary } from '~/lib/household';
import { COPY, STATUS_WORDS, stepStatus } from '~/lib/projectText';
import type { ProjectNotice } from '~/lib/projectNotices';
import { HolderMark } from './HolderMark';
import { NoticeBar } from './NoticeBar';

export interface StepRowProps {
  step: Step;
  projectId: string;
  members: MemberSummary[];
  me: string;
  now: number;
  unsaved: boolean;
  first: boolean;
  last: boolean;
  actions: Pick<ProjectActions, 'editStep' | 'takeStep' | 'releaseStep'>;
  onMove: (step: Step, direction: 'up' | 'down') => void;
  onOpen: (step: Step) => void;
  // What happened to this person's last action on this step, shown here and not at the top of a long page.
  notices?: ProjectNotice[];
  userId?: string;
}

// One step: a tick, its words, its state in words ("Not started", "On it", "Done"), who is on it, and move and hold buttons. A done step
// stays in place with a tick; it does not jump to the bottom.
export function StepRow({ step, projectId, members, me, now, unsaved, first, last, actions, onMove, onOpen, notices = [], userId = me }: StepRowProps) {
  const status = stepStatus(step, members);
  const holder = holderOf(step, members);
  // A step someone has says who in one sentence ("Alex has this") below, so the state word is only for Not started and Done.
  const statusText = [status === 'onIt' ? undefined : STATUS_WORDS[status], unsaved ? COPY.notSaved : undefined].filter(Boolean).join('. ');
  return (
    <Stack gap={4} component="li" style={{ listStyle: 'none', borderBottom: '1px solid var(--mantine-color-default-border)', paddingBlock: 8 }}>
      <Group wrap="nowrap" align="flex-start">
        <Checkbox
          size="md" checked={step.state === 'done'} aria-label={`Mark done: ${step.text}`}
          onChange={event => actions.editStep(projectId, step.id, { state: event.currentTarget.checked ? 'done' : 'todo' })}
        />
        <Stack gap={2} style={{ flex: 1 }}>
          <Text component="button" type="button" ta="left" style={{ background: 'none', border: 0, padding: 0, minHeight: 44, cursor: 'pointer', color: 'inherit', font: 'inherit' }} onClick={() => onOpen(step)}>
            {step.text}
          </Text>
          {statusText !== '' && <Text size="sm">{statusText}</Text>}
          {step.note && <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{step.note}</Text>}
          <HolderMark record={step} members={members} me={me} now={now} />
        </Stack>
      </Group>
      <NoticeBar notices={notices} userId={userId} />
      <Group gap="xs">
        {step.state === 'todo' && holder === undefined && <Button variant="default" size="xs" style={{ minHeight: 44 }} aria-label={`${COPY.takeIt}: ${step.text}`} onClick={() => actions.takeStep(projectId, step.id)}>{COPY.takeIt}</Button>}
        {holder !== undefined && <Button variant="default" size="xs" style={{ minHeight: 44 }} onClick={() => actions.releaseStep(projectId, step.id)}>{COPY.freeIt}</Button>}
        <Button variant="subtle" size="xs" style={{ minHeight: 44 }} disabled={first} onClick={() => onMove(step, 'up')} aria-label={`${COPY.moveUp}: ${step.text}`}>{COPY.moveUp}</Button>
        <Button variant="subtle" size="xs" style={{ minHeight: 44 }} disabled={last} onClick={() => onMove(step, 'down')} aria-label={`${COPY.moveDown}: ${step.text}`}>{COPY.moveDown}</Button>
      </Group>
    </Stack>
  );
}
