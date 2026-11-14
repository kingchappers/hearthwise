import { useState } from 'react';
import { Alert, Button, Code, Group, Stack, Text } from '@mantine/core';
import { useCreateInvite, useInvites, useRevokeInvite } from '~/lib/household';

const SHARE_TITLE = 'Join our Hearthwise household';

function failureMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'household_full') return 'Your household already has two people.';
  if (code === 'too_many_invites') return 'You have too many open invites. Revoke one first.';
  return 'We could not make the link. Check your connection and try again.';
}

// The link is shown only here, once, right after it is made: the server keeps a hash, never the link itself.
export function InviteLink() {
  const create = useCreateInvite();
  const revoke = useRevokeInvite();
  const { data: invites = [] } = useInvites();
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function makeLink(): Promise<void> {
    setError(null);
    setCopied(false);
    try {
      setLink((await create.mutateAsync()).link);
    } catch (failure) {
      console.error('InviteLink: could not create an invite', failure);
      setError(failureMessage(failure));
    }
  }

  async function copy(): Promise<void> {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch (failure) {
      console.error('InviteLink: could not copy the link', failure);
      setError('We could not copy it. Select the link and copy it by hand.');
    }
  }

  async function share(): Promise<void> {
    if (!link) return;
    try {
      await navigator.share({ title: SHARE_TITLE, url: link });
    } catch (failure) {
      // Closing the share sheet rejects with AbortError. That is a choice, not a failure.
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      console.error('InviteLink: could not share the link', failure);
      setError('We could not open sharing. Copy the link instead.');
    }
  }

  async function revokeInvite(hash: string): Promise<void> {
    try {
      await revoke.mutateAsync(hash);
    } catch (failure) {
      console.error('InviteLink: could not revoke an invite', failure);
      setError('We could not revoke that invite. Check your connection and try again.');
    }
  }

  return (
    <Stack>
      <Text size="sm">Share the link with your partner. It works once and expires in 7 days.</Text>
      <Group>
        <Button onClick={() => void makeLink()} loading={create.isPending}>Create invite link</Button>
      </Group>
      {error && <Alert color="honey" role="alert">{error}</Alert>}
      {link && (
        <Stack gap="xs">
          <Code block style={{ wordBreak: 'break-all' }}>{link}</Code>
          <Group>
            <Button variant="default" onClick={() => void copy()}>Copy link</Button>
            {canShare && <Button variant="default" onClick={() => void share()}>Share link</Button>}
          </Group>
          {copied && <Text size="sm" role="status">Link copied</Text>}
        </Stack>
      )}
      {invites.length > 0 && (
        <Stack gap="xs">
          {invites.map(invite => (
            <Group key={invite.hash} justify="space-between" wrap="wrap">
              <Text size="sm">{`Open invite, expires ${new Date(invite.expiresAt * 1000).toLocaleDateString()}`}</Text>
              <Button variant="default" onClick={() => void revokeInvite(invite.hash)}>Revoke</Button>
            </Group>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
