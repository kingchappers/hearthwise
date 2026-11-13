import { useState } from 'react';
import { Alert, Button, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { useRemoveMember, useUpdateMe } from '~/lib/household';
import type { HouseholdData, MemberSummary } from '~/lib/household';

const MAX_DISPLAY_NAME = 40;

function OwnName({ current }: { current: string }) {
  const update = useUpdateMe();
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();
  const valid = Array.from(trimmed).length >= 1 && Array.from(trimmed).length <= MAX_DISPLAY_NAME;

  async function save(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!valid) return;
    setError(null);
    try {
      await update.mutateAsync({ displayName: trimmed });
    } catch (failure) {
      console.error('Members: could not save the display name', failure);
      setError('We could not save your name. Check your connection and try again.');
    }
  }

  return (
    <form onSubmit={save}>
      <Stack gap="xs" align="flex-start">
        <TextInput
          w="100%"
          label="Your name"
          description="How you will appear to your partner."
          value={name}
          onChange={e => setName(e.currentTarget.value)}
          maxLength={MAX_DISPLAY_NAME}
          error={valid ? undefined : `Your name must be 1 to ${MAX_DISPLAY_NAME} characters`}
        />
        {error && <Alert color="honey" role="alert">{error}</Alert>}
        <Button type="submit" variant="default" disabled={!valid || trimmed === current} loading={update.isPending}>Save name</Button>
      </Stack>
    </form>
  );
}

function OtherMember({ member, canRemove }: { member: MemberSummary; canRemove: boolean }) {
  const remove = useRemoveMember();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmRemove(): Promise<void> {
    setError(null);
    try {
      await remove.mutateAsync(member.userId);
      setConfirming(false);
    } catch (failure) {
      console.error('Members: could not remove a member', failure);
      setError('We could not remove them. Check your connection and try again.');
    }
  }

  return (
    <Stack gap="xs" align="flex-start">
      <Group justify="space-between" w="100%" wrap="wrap">
        <Text fw={600}>{member.displayName}</Text>
        {canRemove && !confirming && (
          <Button variant="default" aria-label={`Remove ${member.displayName} from household`} onClick={() => setConfirming(true)}>
            Remove from household
          </Button>
        )}
      </Group>
      {confirming && (
        <Paper withBorder p="sm" role="alertdialog" aria-label={`Remove ${member.displayName}`} w="100%">
          <Stack gap="xs">
            <Text>{`Remove ${member.displayName} from the household?`}</Text>
            <Text size="sm">They lose access to the shared lists. Nothing is deleted, and you can invite them again.</Text>
            {error && <Alert color="honey" role="alert">{error}</Alert>}
            <Group>
              <Button onClick={() => void confirmRemove()} loading={remove.isPending}>{`Yes, remove ${member.displayName}`}</Button>
              <Button variant="default" onClick={() => setConfirming(false)}>{`Keep ${member.displayName}`}</Button>
            </Group>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}

export function Members({ data }: { data: HouseholdData }) {
  const { household, members, me } = data;
  const isCreator = household.createdBy === me.userId;
  const others = members.filter(member => member.userId !== me.userId);

  return (
    <Stack>
      <Text size="sm">{`Household: ${household.name}`}</Text>
      <OwnName current={me.displayName} />
      {others.map(member => (
        <OtherMember key={member.userId} member={member} canRemove={isCreator} />
      ))}
    </Stack>
  );
}
