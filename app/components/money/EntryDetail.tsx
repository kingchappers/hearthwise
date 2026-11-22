import { AskWithReason } from './AskWithReason';
import { Button, Group, Stack, Text, Title } from '@mantine/core';
import type { MoneyEntry } from '../../../src/money/types';
import type { MoneyActions } from '~/hooks/useMoneyActions';
import type { LoanLine } from '~/lib/money';
import { amountLine, kindLabel, loanText, nameOf, shareLine, stateLabel } from '~/lib/moneyText';
import type { People } from '~/lib/moneyText';
import { formatDay } from '~/lib/taskText';
import { dayInZone } from '../../../src/shared/schedule';

export interface EntryDetailProps {
  entry: MoneyEntry;
  people: People;
  notSaved: boolean;
  canWrite: boolean;
  // The loan's progress, when the entry is an agreed loan.
  loan: LoanLine | undefined;
  actions: Pick<MoneyActions, 'respond' | 'askChange' | 'respondChange' | 'withdrawChange' | 'remove' | 'restore'>;
  // Opens the edit sheet. `wordsOnly` is for an entry with a request waiting.
  onEdit: (wordsOnly: boolean) => void;
}

const BUTTON = { minHeight: 44 };

export function EntryDetail({ entry, people, notSaved, canWrite, loan, actions, onEdit }: EntryDetailProps) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const when = (at: number): string => formatDay(dayInZone(at, zone));
  const who = (userId: string): string => nameOf(people, userId);
  const { meId, otherName } = people;
  const state = stateLabel(entry, people);
  const request = entry.pendingChange;
  const deleted = entry.deletedAt !== undefined;
  const share = shareLine(entry, people);

  const action = (label: string, onClick: () => void, primary = false): React.ReactNode => (
    <Button key={label} style={BUTTON} variant={primary ? 'filled' : 'default'} disabled={!canWrite || notSaved} onClick={onClick}>{label}</Button>
  );

  function buttons(): React.ReactNode {
    if (deleted) return <Button style={BUTTON} disabled={!canWrite || notSaved} onClick={() => actions.restore(entry)}>Restore</Button>;
    if (request) {
      const answer = request.by === meId
        ? [action('Withdraw', () => actions.withdrawChange(entry))]
        : [action('Agree', () => actions.respondChange(entry, 'agree'), true), action("Don't change it", () => actions.respondChange(entry, 'decline'))];
      return <>{answer}{action('Change words or date', () => onEdit(true))}</>;
    }
    if (entry.status === 'waiting' && entry.proposedBy !== meId) {
      return (
        <>
          {action('Agree', () => actions.respond(entry, 'agree'), true)}
          {action(`Ask ${otherName} to check`, () => actions.respond(entry, 'decline'))}
          <AskWithReason otherName={otherName} name={entry.description} disabled={!canWrite || notSaved} onAsk={because => actions.respond(entry, 'decline', because)} />
        </>
      );
    }
    if (entry.status === 'declined' && entry.proposedBy !== meId) return null;
    const agreed = entry.status === 'agreed';
    return (
      <>
        {action('Change', () => onEdit(false), true)}
        {action(agreed ? `Ask ${otherName} to agree to delete` : 'Delete', () => (agreed ? actions.askChange(entry, { delete: true }) : actions.remove(entry)))}
      </>
    );
  }

  const controls = buttons();
  const asksForDelete = !deleted && !request && entry.status === 'agreed';

  return (
    <Stack maw={640}>
      <Title order={1} size="h3" style={{ overflowWrap: 'anywhere' }}>{entry.description}</Title>
      {state && <Text fw={600}>{state}</Text>}
      {entry.declinedBecause && <Text>{`Because: ${entry.declinedBecause}`}</Text>}
      {notSaved && <Text size="sm">Not saved yet. The buttons come back when it is saved.</Text>}
      {loan && <Text fw={600}>{loanText(loan.progress, loan.loan.amountPence, loan.paidBack)}</Text>}

      <section>
        <Title order={2} size="h5" mb={4}>Details</Title>
        <Stack gap={4}>
          <Text>{kindLabel(entry.kind)}</Text>
          <Text>{amountLine(entry, people)}</Text>
          {share && <Text>{share}</Text>}
          <Text>{`Date: ${formatDay(entry.on)}`}</Text>
          <Text>{`Added by ${who(entry.createdBy)}, ${when(entry.createdAt)}`}</Text>
          {entry.status === 'agreed' && entry.agreedBy !== undefined && entry.agreedAt !== undefined && <Text>{`Agreed by ${who(entry.agreedBy)}, ${when(entry.agreedAt)}`}</Text>}
          {entry.status === 'agreed' && entry.agreedBy === undefined && <Text>No agreement needed</Text>}
          <Text>{`Last changed by ${who(entry.updatedBy)}, ${when(entry.updatedAt)}`}</Text>
          {deleted && entry.deletedBy !== undefined && entry.deletedAt !== undefined && <Text>{`Deleted by ${who(entry.deletedBy)}, ${when(entry.deletedAt)}`}</Text>}
        </Stack>
      </section>

      {request && (
        <section>
          <Title order={2} size="h5" mb={4}>Waiting</Title>
          <Stack gap={4}>
            <Text>{state}</Text>
            <Text>{`Asked by ${who(request.by)}, ${when(request.at)}`}</Text>
          </Stack>
        </section>
      )}

      {controls && <Group gap="xs">{controls}</Group>}
      {asksForDelete && entry.kind === 'loan' && <Text size="sm">If this loan is deleted, its payments are kept and still count in the total.</Text>}
      {asksForDelete && <Text size="sm">{`The entry stays until ${otherName} agrees.`}</Text>}
    </Stack>
  );
}
