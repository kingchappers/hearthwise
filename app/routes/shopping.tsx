import { Stack, Text, Title } from '@mantine/core';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { pageTitle } from '~/lib/pageTitle';
import type { Route } from './+types/shopping';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Shopping') }];

export default function Shopping() {
  return (
    <DefaultLayout>
      <Stack maw={640}>
        <Title order={1} size="h3">Shopping</Title>
        <Text>Nothing here yet.</Text>
        <Text size="sm">The household shopping list will be here.</Text>
      </Stack>
    </DefaultLayout>
  );
}
