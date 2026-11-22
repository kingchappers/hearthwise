import { Button, Group, Title } from '@mantine/core';
import type { MoneyEntry } from '../../../src/money/types';
import type { MoneyActions } from '~/hooks/useMoneyActions';
import type { People } from '~/lib/moneyText';
import { AskWithReason } from './AskWithReason';
import { EntryRow } from './EntryRow';

export interface WaitingListProps {
  title: string;
  // Waiting for you (agree or ask to check), waiting for them (withdraw a request), or declined entries of yours (change or delete).
  mode: 'forMe' | 'forOther' | 'needsLook';
  entries: MoneyEntry[];
  people: People;
  unsavedIds: ReadonlySet<string>;
  canWrite: boolean;
  actions: Pick<MoneyActions, 'respond' | 'respondChange' | 'withdrawChange' | 'remove'>;
  onEdit: (entry: MoneyEntry) => void;
}

const BUTTON = { minHeight: 44 };

export function WaitingList({ title, mode, entries, people, unsavedIds, canWrite, actions, onEdit }: WaitingListProps) {
  if (entries.length === 0) return null;

  function buttons(entry: MoneyEntry): React.ReactNode {
    const name = entry.description;
    // A change already queued for this entry: a second tap would be a second write.
    const off = !canWrite || unsavedIds.has(entry.id);
    if (mode === 'forMe') {
      const answer = entry.pendingChange ? actions.respondChange : actions.respond;
      return (
        <Group gap="xs">
          <Button style={BUTTON} disabled={off} aria-label={`Agree: ${name}`} onClick={() => answer(entry, 'agree')}>Agree</Button>
          <Button
            style={BUTTON} variant="default" disabled={off}
            aria-label={`${entry.pendingChange ? 'Keep as it is' : `Ask ${people.otherName} to check`}: ${name}`}
            onClick={() => answer(entry, 'decline')}
          >
            {entry.pendingChange ? 'Keep as it is' : `Ask ${people.otherName} to check`}
          </Button>
          {!entry.pendingChange && <AskWithReason otherName={people.otherName} name={name} disabled={off} onAsk={because => actions.respond(entry, 'decline', because)} />}
        </Group>
      );
    }
    if (mode === 'forOther') {
      if (!entry.pendingChange) return null;
      return (
        <Group gap="xs">
          <Button style={BUTTON} variant="default" disabled={off} aria-label={`Withdraw: ${name}`} onClick={() => actions.withdrawChange(entry)}>Withdraw</Button>
        </Group>
      );
    }
    return (
      <Group gap="xs">
        <Button style={BUTTON} disabled={off} aria-label={`Change: ${name}`} onClick={() => onEdit(entry)}>Change</Button>
        <Button style={BUTTON} variant="default" disabled={off} aria-label={`Delete: ${name}`} onClick={() => actions.remove(entry)}>Delete</Button>
      </Group>
    );
  }

  return (
    <section>
      <Title order={2} size="h5" mb={4}>{title}</Title>
      <ul style={{ margin: 0, padding: 0 }}>
        {entries.map(entry => (
          <EntryRow key={entry.id} entry={entry} people={people} notSaved={unsavedIds.has(entry.id)}>{buttons(entry)}</EntryRow>
        ))}
      </ul>
    </section>
  );
}
