import { ENERGY_LABELS } from '../../../src/shared/energy';
import { useState } from 'react';
import { Button, Checkbox, Group, Stack, Text, TextInput } from '@mantine/core';
import { MAX_TAKE_BECAUSE } from '../../../src/shared/projectValidation';
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
  // The place in the order, from 1, shown so a step can be named by its number.
  number?: number;
  // Move up and Move down show only while the person is reordering.
  reordering?: boolean;
  // The first step not done in a project set to be done in order. Only a mark: nothing is blocked.
  isNext?: boolean;
}

// One step: a tick, its words, its state in words ("Not started", "On it", "Done"), who is on it, and move and hold buttons. A done step
// stays in place with a tick; it does not jump to the bottom.
export function StepRow({ step, projectId, members, me, now, unsaved, first, last, actions, onMove, onOpen, notices = [], userId = me, number, reordering = false, isNext = false }: StepRowProps) {
  const [explaining, setExplaining] = useState(false);
  const [because, setBecause] = useState('');
  const status = stepStatus(step, members);
  const holder = holderOf(step, members);
  // A step someone has says who in one sentence ("Alex has this") below, so the state word is only for Not started and Done.
  const statusText = [status === 'onIt' ? undefined : STATUS_WORDS[status], unsaved ? COPY.notSaved : undefined].filter(Boolean).join('. ');
  return (
    <Stack gap={4} component="li" style={{ listStyle: 'none', borderBottom: '1px solid var(--mantine-color-default-border)', paddingBlock: 8 }}>
      <Group wrap="nowrap" align="flex-start">
        {number !== undefined && <Text fw={600} aria-hidden="true" style={{ minWidth: 24, paddingTop: 10 }}>{`${number}.`}</Text>}
        {/* The label is the target: the box is 24 px, the tap area around it 44 px. */}
        <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 44, minHeight: 44, cursor: 'pointer' }}>
          <Checkbox
            size="md" checked={step.state === 'done'} aria-label={`Mark done: ${step.text}`}
            onChange={event => actions.editStep(projectId, step.id, { state: event.currentTarget.checked ? 'done' : 'todo' })}
          />
        </label>
        <Stack gap={2} style={{ flex: 1 }}>
          <Text component="button" type="button" ta="left" style={{ background: 'none', border: 0, padding: 0, minHeight: 44, cursor: 'pointer', color: 'inherit', font: 'inherit' }} onClick={() => onOpen(step)}>
            {step.text}
          </Text>
          {isNext && <Text size="sm" fw={700}>{COPY.next}</Text>}
          {statusText !== '' && <Text size="sm">{statusText}</Text>}
          {step.energy && <Text size="sm">{ENERGY_LABELS[step.energy]} step</Text>}
          {step.note && <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>{step.note}</Text>}
          <HolderMark record={step} members={members} me={me} now={now} />
          {holder !== undefined && step.takenNote && <Text size="sm">{`Because: ${step.takenNote}`}</Text>}
        </Stack>
      </Group>
      <NoticeBar notices={notices} userId={userId} />
      {explaining && step.state === 'todo' && holder === undefined && (
        <form
          onSubmit={event => {
            event.preventDefault();
            actions.takeStep(projectId, step.id, because.trim() === '' ? undefined : because.trim());
            setExplaining(false);
            setBecause('');
          }}
        >
          <Stack gap="xs">
            <TextInput label={COPY.becauseLabel} description={COPY.becauseHint} value={because} onChange={event => setBecause(event.currentTarget.value)} maxLength={MAX_TAKE_BECAUSE} data-autofocus />
            <Group gap="xs">
              <Button type="submit" size="xs" style={{ minHeight: 44 }}>{COPY.takeIt}</Button>
              <Button variant="default" size="xs" style={{ minHeight: 44 }} onClick={() => { setExplaining(false); setBecause(''); }}>Cancel</Button>
            </Group>
          </Stack>
        </form>
      )}
      <Group gap="xs">
        {step.state === 'todo' && holder === undefined && <Button variant="default" size="xs" style={{ minHeight: 44 }} aria-label={`${COPY.takeIt}: ${step.text}`} onClick={() => actions.takeStep(projectId, step.id)}>{COPY.takeIt}</Button>}
        {step.state === 'todo' && holder === undefined && !explaining && <Button variant="subtle" size="xs" style={{ minHeight: 44 }} aria-label={`${COPY.takeWithReason}: ${step.text}`} onClick={() => setExplaining(true)}>{COPY.takeWithReason}</Button>}
        {holder !== undefined && <Button variant="default" size="xs" style={{ minHeight: 44 }} onClick={() => actions.releaseStep(projectId, step.id)}>{COPY.freeIt}</Button>}
        {reordering && (
          <>
            <Button variant="default" size="xs" style={{ minHeight: 44 }} disabled={first} onClick={() => onMove(step, 'up')} aria-label={`${COPY.moveUp}: ${step.text}`}>{COPY.moveUp}</Button>
            <Button variant="default" size="xs" style={{ minHeight: 44 }} disabled={last} onClick={() => onMove(step, 'down')} aria-label={`${COPY.moveDown}: ${step.text}`}>{COPY.moveDown}</Button>
          </>
        )}
      </Group>
    </Stack>
  );
}
