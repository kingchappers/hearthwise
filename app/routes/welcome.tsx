import { Stack, Text, Title } from '@mantine/core';
import { CreateHousehold } from '~/components/household/CreateHousehold';
import { PasteInvite } from '~/components/household/PasteInvite';
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
      <Title order={2} size="h4">Join with an invite</Title>
      <Text>Open the link the other person sent you, or paste it here.</Text>
      <PasteInvite />
      <Title order={2} size="h4">Create a household</Title>
      <Text>Only one of you does this. The other person joins with an invite.</Text>
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
