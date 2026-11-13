import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Group, Loader, Stack, Text, TextInput, Title } from '@mantine/core';
import { useLocation, useNavigate } from 'react-router';
import { LocalAuthForm } from '~/components/authentication/LocalAuthForm';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { useAuth } from '~/lib/auth';
import { useAcceptInvite } from '~/lib/household';
import { clearInviteToken, peekInviteToken, storeInviteToken, tokenFromHash } from '~/lib/inviteToken';
import { loginLocal, setupLocal, signupWithInvite } from '~/lib/localAuth';
import { pageTitle } from '~/lib/pageTitle';
import type { Route } from './+types/join';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Join your household') }];

const MAX_DISPLAY_NAME = 40;
const EXPIRED = 'This invite has expired. Ask your partner for a new link.';

type Outcome =
  | { kind: 'none' }
  | { kind: 'confirmMove' }
  | { kind: 'problem'; message: string };

function describeFailure(error: unknown): { outcome: Outcome; final: boolean } {
  const { status, code, canMove } = error as { status?: number; code?: string; canMove?: boolean };
  if (status === 410 || code === 'invite_expired') return { outcome: { kind: 'problem', message: EXPIRED }, final: true };
  if (code === 'household_full') return { outcome: { kind: 'problem', message: 'This household already has two people.' }, final: true };
  if (code === 'already_member' && canMove) return { outcome: { kind: 'confirmMove' }, final: false };
  if (code === 'already_member') {
    return { outcome: { kind: 'problem', message: "You're already in a household that has things in it, so it can't be moved into this one." }, final: true };
  }
  return { outcome: { kind: 'problem', message: 'We could not join the household. Check your connection and try again.' }, final: false };
}

function AcceptInvite({ token, defaultName }: { token: string; defaultName: string }) {
  const accept = useAcceptInvite();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(defaultName);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' });
  const name = displayName.trim();
  const validName = Array.from(name).length >= 1 && Array.from(name).length <= MAX_DISPLAY_NAME;

  async function join(confirmMove: boolean): Promise<void> {
    setOutcome({ kind: 'none' });
    try {
      await accept.mutateAsync(confirmMove ? { token, displayName: name, confirmMove: true } : { token, displayName: name });
      clearInviteToken();
      navigate('/', { replace: true });
    } catch (failure) {
      console.error('Join: could not accept the invite', failure);
      const { outcome: next, final } = describeFailure(failure);
      // The stored copy goes once the server has given a final answer; the page keeps its own for a retry.
      if (final) clearInviteToken();
      setOutcome(next);
    }
  }

  if (outcome.kind === 'confirmMove') {
    return (
      <Stack>
        <Text>Move to your partner's household? Your current household is empty and will be removed.</Text>
        <Group>
          <Button onClick={() => void join(true)} loading={accept.isPending}>Move to their household</Button>
          <Button variant="default" onClick={() => { clearInviteToken(); navigate('/', { replace: true }); }}>Stay where I am</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack>
      <Text>You've been invited to share a household.</Text>
      <TextInput
        label="Your name"
        description="How you will appear to your partner."
        value={displayName}
        onChange={e => setDisplayName(e.currentTarget.value)}
        maxLength={MAX_DISPLAY_NAME}
      />
      {outcome.kind === 'problem' && <Alert color="honey" role="alert">{outcome.message}</Alert>}
      <Group>
        <Button onClick={() => void join(false)} disabled={!validName} loading={accept.isPending}>Join household</Button>
      </Group>
    </Stack>
  );
}

function LocalSignup({ token }: { token: string }) {
  const navigate = useNavigate();
  const { login } = useAuth();

  async function signup(input: { email: string; password: string; displayName: string }): Promise<void> {
    try {
      await signupWithInvite({ token, ...input });
      navigate('/', { replace: true });
    } finally {
      // Success or failure, the stored copy is done with. The page keeps the token for a retry (a typo in the email).
      clearInviteToken();
    }
  }

  return (
    <Stack>
      <LocalAuthForm mode="invite" onLogin={loginLocal} onSetup={setupLocal} onSignup={signup} />
      {/* Someone who already has an account signs in, then joins from this page with the token the page is holding. */}
      <Button variant="subtle" onClick={() => void Promise.resolve(login()).catch((error: unknown) => console.error('Join: could not open sign-in', error))}>
        Already have an account? Sign in
      </Button>
    </Stack>
  );
}

function StartSignIn() {
  const { login } = useAuth();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void Promise.resolve(login()).catch((error: unknown) => console.error('Join: could not start sign-in', error));
  }, [login]);
  return (
    <Group role="status">
      <Loader size="sm" />
      <Text>Taking you to sign in…</Text>
    </Group>
  );
}

function JoinContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const auth = useAuth();
  // The link's fragment first, then the copy kept from before a sign-in redirect.
  const [token] = useState(() => tokenFromHash(location.hash) ?? peekInviteToken());

  useEffect(() => {
    const fromHash = tokenFromHash(location.hash);
    if (!fromHash) return;
    storeInviteToken(fromHash);
    navigate({ hash: '' }, { replace: true });
  }, [location.hash, navigate]);

  let body: React.ReactNode;
  if (!token) {
    body = <Alert color="honey" role="alert">This invite link doesn't look right. Ask your partner for a new link.</Alert>;
  } else if (auth.isLoading) {
    body = <Group role="status"><Loader size="sm" /><Text>Checking your invite…</Text></Group>;
  } else if (auth.isAuthenticated) {
    body = <AcceptInvite token={token} defaultName={auth.user?.name ?? auth.user?.nickname ?? ''} />;
  } else if (auth.mode === 'local') {
    body = <LocalSignup token={token} />;
  } else {
    body = <StartSignIn />;
  }

  return (
    <Stack maw={480}>
      <Title order={1} size="h3">Join your household</Title>
      {body}
    </Stack>
  );
}

export default function Join() {
  return (
    <DefaultLayout>
      <JoinContent />
    </DefaultLayout>
  );
}
