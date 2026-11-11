import { Stack, Text, Title } from '@mantine/core';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { pageTitle } from '~/lib/pageTitle';
import type { Route } from './+types/_index';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Today') }];

export default function Today() {
  return (
    <DefaultLayout>
      <Stack maw={640}>
        <Title order={1} size="h3">Today</Title>
        <Text>Nothing here yet.</Text>
        <Text size="sm">Chores and to-dos you add will show up here.</Text>
      </Stack>
    </DefaultLayout>
  );
}
