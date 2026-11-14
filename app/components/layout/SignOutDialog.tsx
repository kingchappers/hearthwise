import { useEffect } from 'react';
import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '~/lib/auth';
import { useHouseholdRuntime } from '~/lib/householdRuntime';
import { clearStoredUser, pendingWriteCount, signOutCleanup } from '~/lib/persistedCache';
import { cancelSignOut, useSignOutRequested } from '~/lib/signOut';

// Signing out clears this person's saved cache, including any changes not yet saved. With none waiting it just signs out; with some it
// says how many would be lost and asks first.
export function SignOutDialog() {
  const requested = useSignOutRequested();
  const client = useQueryClient();
  const { logout } = useAuth();
  const { runtime, cacheUserId } = useHouseholdRuntime();
  const waiting = requested ? pendingWriteCount(client) : 0;

  async function signOut(): Promise<void> {
    cancelSignOut();
    if (cacheUserId) await signOutCleanup({ client, userId: cacheUserId, seal: runtime.seal });
    else clearStoredUser();
    await logout();
  }

  useEffect(() => {
    if (requested && waiting === 0) void signOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);

  const lost = waiting === 1 ? 'it' : 'them';
  return (
    <Modal opened={requested && waiting > 0} onClose={cancelSignOut} title="Sign out?" centered closeButtonProps={{ 'aria-label': 'Close' }}>
      <Stack>
        <Text>{`${waiting} ${waiting === 1 ? "change hasn't" : "changes haven't"} been saved yet. Signing out now loses ${lost}.`}</Text>
        <Group>
          <Button onClick={cancelSignOut}>Stay signed in</Button>
          <Button variant="default" onClick={() => void signOut()}>{`Sign out and lose ${lost}`}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
