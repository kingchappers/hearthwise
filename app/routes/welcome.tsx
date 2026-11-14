import { Stack, Text, Title } from '@mantine/core';
import { CreateHousehold } from '~/components/household/CreateHousehold';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { useAuth } from '~/lib/auth';
import { pageTitle } from '~/lib/pageTitle';
import type { Route } from './+types/welcome';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Welcome') }];

function WelcomeContent() {
  const { user } = useAuth();
  return (
    <Stack maw={480}>
      <Title order={1} size="h3">Welcome</Title>
      <Text>Waiting for an invite? Open the link your partner sent you.</Text>
      <Title order={2} size="h4">Create a household</Title>
      <CreateHousehold defaultDisplayName={user?.name ?? user?.nickname ?? ''} />
    </Stack>
  );
}

export default function Welcome() {
  return (
    <DefaultLayout>
      <WelcomeContent />
    </DefaultLayout>
  );
}
