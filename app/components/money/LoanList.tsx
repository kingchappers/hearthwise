import { Progress, Title } from '@mantine/core';
import type { LoanLine } from '~/lib/money';
import { loanText } from '~/lib/moneyText';
import type { People } from '~/lib/moneyText';
import { EntryRow } from './EntryRow';

export interface LoanListProps {
  loans: LoanLine[];
  people: People;
  unsavedIds: ReadonlySet<string>;
}

// Each loan with its own progress as a line of text. The bar repeats the text as a picture and is hidden from screen readers.
export function LoanList({ loans, people, unsavedIds }: LoanListProps) {
  if (loans.length === 0) return null;
  return (
    <section>
      <Title order={2} size="h5" mb={4}>Loans</Title>
      <ul style={{ margin: 0, padding: 0 }}>
        {loans.map(({ loan, progress, paidBack }) => (
          <EntryRow key={loan.id} entry={loan} people={people} notSaved={unsavedIds.has(loan.id)} compact>
            <span style={{ fontWeight: 600 }}>{loanText(progress, loan.amountPence, paidBack)}</span>
            <div aria-hidden><Progress value={(progress / loan.amountPence) * 100} color="sage" mt={4} /></div>
          </EntryRow>
        ))}
      </ul>
    </section>
  );
}
