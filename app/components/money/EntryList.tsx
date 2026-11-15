import { Title } from '@mantine/core';
import type { MoneyEntry } from '../../../src/money/types';
import type { People } from '~/lib/moneyText';
import { EntryRow } from './EntryRow';

export interface EntryListProps {
  entries: MoneyEntry[];
  people: People;
  unsavedIds: ReadonlySet<string>;
}

export function EntryList({ entries, people, unsavedIds }: EntryListProps) {
  if (entries.length === 0) return null;
  return (
    <section>
      <Title order={2} size="h5" mb={4}>Entries</Title>
      <ul style={{ margin: 0, padding: 0 }}>
        {entries.map(entry => <EntryRow key={entry.id} entry={entry} people={people} notSaved={unsavedIds.has(entry.id)} />)}
      </ul>
    </section>
  );
}
