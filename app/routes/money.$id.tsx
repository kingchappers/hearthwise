import { useState } from 'react';
import { Anchor, Group, Loader, Stack, Text } from '@mantine/core';
import { Link, useParams } from 'react-router';
import type { MoneyEntry } from '../../src/money/types';
import { dayInZone } from '../../src/shared/schedule';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { LoadError } from '~/components/layout/LoadError';
import { AddSheet } from '~/components/money/AddSheet';
import { EntryDetail } from '~/components/money/EntryDetail';
import { LetThemKnow } from '~/components/shared/LetThemKnow';
import { useChangeNotices, useMoneyActions } from '~/hooks/useMoneyActions';
import { useHousehold } from '~/lib/household';
import { useMoney } from '~/lib/money';
import { pageTitle } from '~/lib/pageTitle';
import type { Route } from './+types/money.$id';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Money') }];

const BackLink = () => <Anchor component={Link} to="/money" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>Back to Money</Anchor>;

function EntryContent() {
  const { id = '' } = useParams();
  const money = useMoney();
  const actions = useMoneyActions();
  const household = useHousehold();
  useChangeNotices(money.serverEntries, money.me);
  // Which way the sheet is open: for the whole entry, or only for its words and date.
  // The entry is kept as it was when the sheet opened, so a save names the version the person was looking at.
  const [sheet, setSheet] = useState<{ mode: 'closed' | 'all' | 'words'; entry?: MoneyEntry }>({ mode: 'closed' });

  if (money.status === 'loading') return <Group justify="center" py="xl" role="status" aria-label="Loading the entry"><Loader /></Group>;
  if (money.status === 'error') return <LoadError thing="entry" onRetry={money.refetch} />;

  const entry = money.entries.find(candidate => candidate.id === id);
  if (!entry) {
    return (
      <Stack maw={640}>
        <Text>We can't find that entry. It may have been deleted a while ago.</Text>
        <BackLink />
      </Stack>
    );
  }

  const timezone = household.data?.household.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <Stack maw={640}>
      <BackLink />
      <LetThemKnow />
      <EntryDetail
        entry={entry} people={money.people} notSaved={money.unsavedIds.has(entry.id)} canWrite={money.canWrite}
        loan={money.loans.find(line => line.loan.id === entry.id)} actions={actions} onEdit={wordsOnly => setSheet({ mode: wordsOnly ? 'words' : 'all', entry })}
      />
      <AddSheet
        key={sheet.mode} opened={sheet.mode !== 'closed'} onClose={() => setSheet({ mode: 'closed' })} entry={sheet.entry ?? entry} wordsOnly={sheet.mode === 'words'} entries={money.entries}
        people={money.people} today={dayInZone(Date.now(), timezone)} canWrite={money.canWrite} actions={actions}
      />
    </Stack>
  );
}

export default function MoneyEntry() {
  return (
    <DefaultLayout>
      <EntryContent />
    </DefaultLayout>
  );
}
