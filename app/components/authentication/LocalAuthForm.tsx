import { useState } from 'react';
import { Alert, Anchor, Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const MAX_NAME_LENGTH = 40;
const DOCS_URL = 'https://github.com/kingchappers/hearthwise/blob/main/docs/SELF-HOSTING.md#forgot-your-password';

// login: an existing account. setup: the first account on this instance (needs the setup code). invite: a new account made from an invite link.
export type LocalAuthMode = 'login' | 'setup' | 'invite';

interface NewAccount {
  email: string;
  password: string;
  displayName: string;
}

interface Props {
  mode: LocalAuthMode;
  onLogin(email: string, password: string): Promise<void>;
  onSetup(input: NewAccount & { code: string }): Promise<void>;
  onSignup(input: NewAccount): Promise<void>;
}

export function LocalAuthForm({ mode, onLogin, onSetup, onSignup }: Props) {
  const creating = mode !== 'login';
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function problem(name: string): string | null {
    if (!creating) return null;
    const length = Array.from(name).length;
    if (length < 1 || length > MAX_NAME_LENGTH) return `Your name must be 1 to ${MAX_NAME_LENGTH} characters`;
    if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    return null;
  }

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const name = displayName.trim();
    const invalid = problem(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'setup') await onSetup({ code: code.trim(), email: email.trim(), password, displayName: name });
      else if (mode === 'invite') await onSignup({ email: email.trim(), password, displayName: name });
      else await onLogin(email.trim(), password);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        {mode === 'setup' && (
          <>
            <Text size="sm">Create the account for this instance. Your setup code is in your host's logs (for example, on PikaPods: More, then Show Logs) or in the file SETUP_CODE.txt in your data folder. Restarting before you finish makes a new one.</Text>
            <TextInput label="Setup code" value={code} onChange={e => setCode(e.currentTarget.value)} required withAsterisk={false} autoComplete="off" />
          </>
        )}
        <Text size="sm" c="dimmed">All fields are required.</Text>
        <TextInput label="Email" type="email" value={email} onChange={e => setEmail(e.currentTarget.value)} required withAsterisk={false} autoComplete="username" />
        {creating && (
          <TextInput
            label="Your name"
            description="How your partner sees you"
            value={displayName}
            onChange={e => setDisplayName(e.currentTarget.value)}
            required
            withAsterisk={false}
            autoComplete="name"
          />
        )}
        <PasswordInput
          label="Password"
          value={password}
          onChange={e => setPassword(e.currentTarget.value)}
          required
          withAsterisk={false}
          maxLength={MAX_PASSWORD_LENGTH}
          description={creating ? `At least ${MIN_PASSWORD_LENGTH} characters` : undefined}
          autoComplete={creating ? 'new-password' : 'current-password'}
        />
        {error && <Alert color="honey" role="alert">{error}</Alert>}
        <Button type="submit" loading={busy}>{creating ? 'Create account' : 'Sign in'}</Button>
        {!creating && (
          <Text size="xs" c="dimmed">
            Forgot your password? <Anchor href={DOCS_URL} target="_blank" rel="noopener noreferrer" size="xs">How to reset it</Anchor>
          </Text>
        )}
      </Stack>
    </form>
  );
}
