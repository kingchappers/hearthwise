import { Alert, Button, Stack, Text, Title } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useAuth } from '~/lib/auth';
import { SESSION_LIFETIME_TEXT } from '~/lib/sessionLifetime';
import { explainSignInError } from '~/lib/signInError';
import type { SignInError } from '~/lib/signInError';
import { Logo } from './Logo';

export interface SignedOutPanelProps {
  sessionEnded: boolean;
  signInError?: SignInError;
}

export function SignedOutPanel({ sessionEnded, signInError }: SignedOutPanelProps) {
  const { login } = useAuth();
  const hint = signInError ? explainSignInError(signInError.message) : undefined;

  async function signIn(): Promise<void> {
    try {
      await login();
    } catch (error) {
      console.error('SignedOutPanel: could not start sign-in', error);
    }
  }

  return (
    <Stack align="center" gap="md" py={48} maw={420} mx="auto" ta="center">
      <Logo height={64} />
      <IconLock size={40} stroke={1.5} aria-hidden="true" />
      <Title order={1} size="h2">{sessionEnded ? 'Your session has ended' : "You're signed out"}</Title>
      <Text>Your data is safe. Sign in to see it.</Text>
      {signInError && (
        <Alert color="honey" role="alert" ta="start" title="Sign-in did not finish">
          {/* Auth0's text, shown as text only. */}
          {signInError.message && <Text size="sm">{signInError.message}</Text>}
          {hint && <Text size="sm" mt="xs">{hint}</Text>}
        </Alert>
      )}
      <Button size="lg" onClick={() => void signIn()}>Sign in</Button>
      <Text size="sm">{SESSION_LIFETIME_TEXT}</Text>
    </Stack>
  );
}
