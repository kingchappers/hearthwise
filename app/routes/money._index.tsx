import { useState } from 'react';
import { Alert, Button, Group, Loader, Stack, Switch, Text, Title } from '@mantine/core';
import type { MoneyEntry } from '../../src/money/types';
import { dayInZone } from '../../src/shared/schedule';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { LoadError } from '~/components/layout/LoadError';
import { AddSheet } from '~/components/money/AddSheet';
import { EntryList } from '~/components/money/EntryList';
import { LoanList } from '~/components/money/LoanList';
import { TotalCard } from '~/components/money/TotalCard';
import { WaitingList } from '~/components/money/WaitingList';
import { LetThemKnow } from '~/components/shared/LetThemKnow';
import { useChangeNotices, useMoneyActions } from '~/hooks/useMoneyActions';
import { useHousehold } from '~/lib/household';
import { sectionsFor, useMoney } from '~/lib/money';
import { hiddenText } from '~/lib/moneyText';
import { pageTitle } from '~/lib/pageTitle';
import type { Route } from './+types/money._index';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Money') }];

function MoneyContent() {
  const money = useMoney();
  const actions = useMoneyActions();
  const household = useHousehold();
  const [showSettled, setShowSettled] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MoneyEntry | undefined>();
  useChangeNotices(money.entries, money.me);

  if (money.status === 'loading') return <Group justify="center" py="xl" role="status" aria-label="Loading money"><Loader /></Group>;
  if (money.status === 'error') return <LoadError thing="money" onRetry={money.refetch} />;

  const timezone = household.data?.household.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const sections = sectionsFor(money.entries, money.me, money.settled, showSettled);
  const live = money.entries.filter(entry => entry.deletedAt === undefined);
  const nothingToShow = sections.loans.length === 0 && sections.entries.length === 0
    && sections.waitingForMe.length === 0 && sections.waitingForOther.length === 0 && sections.needsLook.length === 0;
  const closeSheet = (): void => { setAdding(false); setEditing(undefined); };
  const list = { people: money.people, unsavedIds: money.unsavedIds };

  return (
    <Stack maw={640}>
      <Group justify="space-between" align="center">
        <Title order={1} size="h3">Money</Title>
        <Button style={{ minHeight: 44 }} disabled={!money.canWrite} onClick={() => setAdding(true)}>Add</Button>
      </Group>
      {!money.canWrite && <Alert color="honey" role="note">Adding or agreeing needs the two people this ledger is between.</Alert>}
      <TotalCard total={money.total} people={money.people} unsaved={money.unsaved} />
      <LetThemKnow />
      {live.length === 0 && <Text>No money entries yet. Add one when you share a cost or lend money.</Text>}

      <WaitingList title="Waiting for you" mode="forMe" entries={sections.waitingForMe} canWrite={money.canWrite} actions={actions} onEdit={setEditing} {...list} />
      <WaitingList title={`Waiting for ${money.people.otherName}`} mode="forOther" entries={sections.waitingForOther} canWrite={money.canWrite} actions={actions} onEdit={setEditing} {...list} />
      <WaitingList title="Needs another look" mode="needsLook" entries={sections.needsLook} canWrite={money.canWrite} actions={actions} onEdit={setEditing} {...list} />
      <LoanList loans={sections.loans} {...list} />
      <EntryList entries={sections.entries} {...list} />

      {sections.hidden > 0 && nothingToShow && <Text>{hiddenText(sections.hidden)}</Text>}
      {money.settled.size > 0 && <Switch label="Show settled" checked={showSettled} onChange={event => setShowSettled(event.currentTarget.checked)} />}

      <AddSheet
        key={editing?.id ?? 'new'} opened={adding || editing !== undefined} onClose={closeSheet} entry={editing} entries={money.entries}
        people={money.people} today={dayInZone(Date.now(), timezone)} canWrite={money.canWrite} actions={actions}
      />
    </Stack>
  );
}

export default function Money() {
  return (
    <DefaultLayout>
      <MoneyContent />
    </DefaultLayout>
  );
}
