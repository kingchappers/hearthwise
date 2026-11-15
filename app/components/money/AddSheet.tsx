import { useState } from 'react';
import { Alert, Button, NativeSelect, Radio, Stack, Text, TextInput } from '@mantine/core';
import type { MoneyChange, MoneyEntry, MoneyKind } from '../../../src/money/types';
import { formatPounds } from '../../../src/shared/money';
import type { SplitMode } from '../../../src/shared/money';
import type { MoneyActions } from '~/hooks/useMoneyActions';
import { blankForm, evaluateForm, formFromEntry, paymentDescription, splitOptions } from '~/lib/moneyForm';
import type { FormState } from '~/lib/moneyForm';
import { duplicatePayment, openLoansFor } from '~/lib/money';
import { counterpartOf, kindLabel, nameOf } from '~/lib/moneyText';
import type { People } from '~/lib/moneyText';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';
import { LetThemKnow } from '../shared/LetThemKnow';

export interface AddSheetProps {
  opened: boolean;
  onClose: () => void;
  // The entry being edited. Left out to add.
  entry?: MoneyEntry;
  // Change only the words and the date: an agreed entry with a request waiting keeps its money until that is answered.
  wordsOnly?: boolean;
  entries: MoneyEntry[];
  people: People;
  today: string;
  canWrite: boolean;
  actions: Pick<MoneyActions, 'add' | 'edit' | 'askChange'>;
}

const KINDS: MoneyKind[] = ['expense', 'loan', 'payment'];
const PAYER_LABEL: Record<MoneyKind, string> = { expense: 'Who paid?', loan: 'Who lent it?', payment: 'Who sent it?' };
const BUTTON = { minHeight: 44 };

const sameMoney = (entry: MoneyEntry, money: MoneyChange): boolean =>
  entry.paidBy === money.paidBy && entry.amountPence === money.amountPence && entry.sharePence === money.sharePence && entry.loanId === money.loanId;

function title(entry: MoneyEntry | undefined, wordsOnly: boolean): string {
  if (!entry) return 'Add';
  if (wordsOnly) return 'Change words or date';
  return entry.status === 'agreed' ? 'Change entry' : 'Edit entry';
}

function Content({ onClose, entry, wordsOnly = false, entries, people, today, canWrite, actions }: Omit<AddSheetProps, 'opened'>) {
  const [form, setForm] = useState<FormState>(() => (entry ? formFromEntry(entry) : blankForm('expense', people.meId, today)));
  const [submitted, setSubmitted] = useState(false);
  // Made once, when the sheet opens, and kept while it is open: a double tap is one entry.
  const [ids] = useState(() => ({ id: crypto.randomUUID(), mutationId: crypto.randomUUID() }));
  const set = (patch: Partial<FormState>): void => setForm(current => ({ ...current, ...patch }));

  const asking = entry?.status === 'agreed';
  const counterpart = counterpartOf(people, form);
  const loans = form.kind === 'payment' ? openLoansFor(entries, form.paidBy) : [];
  const current = entry?.loanId === undefined ? undefined : entries.find(loan => loan.id === entry.loanId && loan.paidBy !== form.paidBy);
  if (current && !loans.some(loan => loan.id === current.id)) loans.unshift(current);
  const loanId = loans.some(loan => loan.id === form.loanId) ? form.loanId : '';
  const result = evaluateForm({ ...form, loanId }, people);
  const loan = loans.find(candidate => candidate.id === loanId);

  const duplicate = form.kind === 'payment' && result.amountPence !== undefined
    ? duplicatePayment(entries, { paidBy: form.paidBy, amountPence: result.amountPence, on: form.on }, entry?.id)
    : undefined;

  const moneyChanged = !wordsOnly && entry !== undefined && result.money !== undefined && !sameMoney(entry, result.money);
  const label = !entry ? 'Add' : asking && moneyChanged ? `Ask ${people.otherName} to agree` : 'Save';
  const payers = [{ value: people.meId, label: people.meName }, { value: people.otherId, label: people.otherName }];

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    setSubmitted(true);
    const valid = wordsOnly ? result.errors.description === undefined && result.errors.on === undefined : result.valid;
    if (!valid || !canWrite) return;

    if (!entry) {
      if (!result.money) return;
      const description = form.kind === 'payment' ? paymentDescription(loan?.description) : result.description;
      actions.add({ ...ids, kind: form.kind, description, on: form.on, money: result.money });
      onClose();
      return;
    }

    const words = form.kind !== 'payment' && result.description !== entry.description ? { description: result.description } : {};
    const date = form.on !== entry.on ? { on: form.on } : {};
    if (asking) {
      if (Object.keys({ ...words, ...date }).length > 0) actions.edit(entry, { ...words, ...date });
      if (moneyChanged && result.money) actions.askChange(entry, { money: result.money });
    } else {
      const changes = { ...(moneyChanged && result.money ? { money: result.money } : {}), ...words, ...date };
      if (Object.keys(changes).length > 0) actions.edit(entry, changes);
    }
    onClose();
  }

  const errorFor = (field: 'description' | 'amount' | 'on'): string | undefined => (submitted ? result.errors[field] : undefined);

  return (
    <form onSubmit={submit} noValidate>
      <Stack>
        {!canWrite && <Alert color="honey" role="note">Adding or agreeing needs the two people this ledger is between.</Alert>}
        {!entry && (
          <Radio.Group label="What are you adding?" value={form.kind} onChange={value => set({ kind: value as MoneyKind })}>
            <Stack gap="xs" mt="xs">
              {KINDS.map(kind => <Radio key={kind} value={kind} label={kindLabel(kind)} styles={{ root: { minHeight: 44, display: 'flex', alignItems: 'center' } }} />)}
            </Stack>
          </Radio.Group>
        )}

        {!wordsOnly && <NativeSelect label={PAYER_LABEL[form.kind]} data={payers} value={form.paidBy} onChange={event => set({ paidBy: event.currentTarget.value })} />}
        {form.kind !== 'payment' && (
          <TextInput label="What for?" value={form.description} onChange={event => set({ description: event.currentTarget.value })} maxLength={240} error={errorFor('description')} />
        )}
        {!wordsOnly && (
          <TextInput
            label="How much?" description="In pounds, like 12.50" inputMode="decimal" value={form.amount}
            onChange={event => set({ amount: event.currentTarget.value })} error={errorFor('amount')}
          />
        )}
        <TextInput label="On what date?" type="date" value={form.on} onChange={event => set({ on: event.currentTarget.value })} error={errorFor('on')} />

        {!wordsOnly && form.kind === 'expense' && (
          <>
            <NativeSelect
              label="Split" data={splitOptions(form.paidBy, people)} value={form.splitMode}
              onChange={event => set({ splitMode: event.currentTarget.value as SplitMode, splitValue: '' })}
            />
            {form.splitMode === 'fixed' && (
              <TextInput
                label={`Fixed share for ${nameOf(people, counterpart)}, in pounds`} inputMode="decimal" value={form.splitValue}
                onChange={event => set({ splitValue: event.currentTarget.value })} error={result.errors.share}
              />
            )}
            {form.splitMode === 'percent' && (
              <TextInput
                label={`Percentage for ${nameOf(people, counterpart)}`} inputMode="numeric" value={form.splitValue}
                onChange={event => set({ splitValue: event.currentTarget.value })} error={result.errors.share}
              />
            )}
            {result.errors.share && form.splitMode !== 'fixed' && form.splitMode !== 'percent' && <Text role="alert" size="sm">{result.errors.share}</Text>}
            {result.shareText && <Text fw={600} role="status">{result.shareText}</Text>}
          </>
        )}

        {!wordsOnly && form.kind === 'payment' && (
          <NativeSelect
            label="Which loan is it for?" value={loanId} onChange={event => set({ loanId: event.currentTarget.value })}
            data={[{ value: '', label: 'None, just a payment' }, ...loans.map(candidate => ({ value: candidate.id, label: `${candidate.description}, ${formatPounds(candidate.amountPence)}` }))]}
          />
        )}
        {duplicate && (
          <Text role="status" size="sm">
            {`There is already a ${formatPounds(duplicate.amountPence)} payment from ${nameOf(people, duplicate.paidBy)} on this date. Is this a different one?`}
          </Text>
        )}

        {asking && !wordsOnly && <Text size="sm">{`A change to the money needs ${people.otherName} to agree. A change to the words or the date does not.`}</Text>}
        <LetThemKnow />
        <Button type="submit" style={BUTTON} disabled={!canWrite}>{label}</Button>
      </Stack>
    </form>
  );
}

export function AddSheet({ opened, onClose, ...rest }: AddSheetProps) {
  return (
    <ResponsiveSheet opened={opened} onClose={onClose} title={title(rest.entry, rest.wordsOnly ?? false)}>
      {opened && <Content onClose={onClose} {...rest} />}
    </ResponsiveSheet>
  );
}
