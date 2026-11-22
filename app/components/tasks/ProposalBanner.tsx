import { Alert, Button, Group, Stack, Text } from '@mantine/core';
import type { Change, Proposal, Task } from '../../../src/tasks/types';
import { formatDay, memberName, repeatLabel } from '~/lib/taskText';
import type { NamedMember } from '~/lib/taskText';

export interface ProposalBannerProps {
  proposals: Proposal[];
  tasks: Task[];
  roster: NamedMember[];
  viewerId: string;
  onAccept: (proposal: Proposal) => void;
  onDecline: (proposal: Proposal) => void;
  onWithdraw: (proposal: Proposal) => void;
}

// Whether the change only hands the task to the other person. Said by the person who asked, that is "take": "give X to Alex" read as
// Alex giving it to Alex.
function isTake(change: Change, viewerId: string, mine: boolean): boolean {
  if (!mine || change.kind !== 'edit') return false;
  const { assignee, dueOn, repeat } = change.set;
  return assignee !== undefined && assignee !== 'either' && assignee !== 'both' && assignee !== viewerId && dueOn === undefined && repeat === undefined;
}

// What the change asks for, said from the viewer's side.
function describe(change: Change, title: string, roster: NamedMember[], viewerId: string, mine: boolean): string {
  const quoted = `"${title}"`;
  if (isTake(change, viewerId, mine)) return `take ${quoted}`;
  if (change.kind === 'swap') return `swap ${quoted}`;
  if (change.kind === 'delete') return `delete ${quoted}`;
  if (change.kind === 'restore') return `restore ${quoted}`;
  const parts: string[] = [];
  const { assignee, dueOn, repeat } = change.set;
  if (assignee !== undefined) {
    const who = assignee === 'either' ? 'anyone' : assignee === 'both' ? 'both of you' : assignee === viewerId ? 'you' : memberName(roster, assignee);
    parts.push(`give ${quoted} to ${who}`);
  }
  if (repeat !== undefined) parts.push(`change how ${quoted} repeats (${repeatLabel(repeat)})`);
  if (dueOn !== undefined && repeat === undefined) parts.push(`move ${quoted} to ${formatDay(dueOn)}`);
  return parts.join(' and ');
}

const RESOLVED = { accepted: 'accepted', declined: 'declined', withdrawn: 'withdrew' } as const;

// Proposals between the two people: ones waiting for the viewer, ones the viewer is waiting on, and how the viewer's recent ones ended.
export function ProposalBanner({ proposals, tasks, roster, viewerId, onAccept, onDecline, onWithdraw }: ProposalBannerProps) {
  if (proposals.length === 0) return null;
  const titleOf = (taskId: string): string => tasks.find(task => task.id === taskId)?.title ?? 'a task';
  const otherName = (proposal: Proposal): string =>
    proposal.toUserId && proposal.toUserId !== viewerId
      ? memberName(roster, proposal.toUserId)
      : (roster.find(member => member.userId !== viewerId)?.displayName ?? 'them');

  return (
    <Stack gap="xs">
      {proposals.map(proposal => {
        const mine = proposal.fromUserId === viewerId;
        const what = describe(proposal.change, titleOf(proposal.taskId), roster, viewerId, mine);

        if (proposal.status === 'pending' && !mine) {
          return (
            <Alert key={proposal.id} color="honey" title="Waiting for you">
              <Stack gap="xs">
                <Text>{`${memberName(roster, proposal.fromUserId)} asks to ${what}`}</Text>
                <Group>
                  <Button onClick={() => onAccept(proposal)}>Accept</Button>
                  <Button variant="default" onClick={() => onDecline(proposal)}>Decline</Button>
                </Group>
              </Stack>
            </Alert>
          );
        }
        if (proposal.status === 'pending') {
          return (
            <Alert key={proposal.id} color="honey" title={`Waiting for ${otherName(proposal)}`}>
              <Stack gap="xs">
                <Text>{`You asked ${otherName(proposal)} to ${what}.`}</Text>
                <Group><Button variant="default" onClick={() => onWithdraw(proposal)}>Withdraw</Button></Group>
              </Stack>
            </Alert>
          );
        }
        if (proposal.status === 'stale') {
          return (
            <Alert key={proposal.id} color="honey">
              <Text>No longer applies: the task changed</Text>
              <Text size="sm">{`You asked ${otherName(proposal)} to ${what}`}</Text>
            </Alert>
          );
        }
        if (isTake(proposal.change, viewerId, mine) && (proposal.status === 'accepted' || proposal.status === 'declined')) {
          const quoted = `"${titleOf(proposal.taskId)}"`;
          const text = proposal.status === 'accepted'
            ? `${otherName(proposal)} said yes to taking ${quoted}. It is now theirs.`
            : `${otherName(proposal)} said no to taking ${quoted}. It is still on your list.`;
          return <Alert key={proposal.id} color="honey"><Text>{text}</Text></Alert>;
        }
        const result = proposal.status === 'withdrawn' ? 'You withdrew' : `${otherName(proposal)} ${RESOLVED[proposal.status]}`;
        return <Alert key={proposal.id} color="honey"><Text>{`${result}: ${what}`}</Text></Alert>;
      })}
    </Stack>
  );
}
