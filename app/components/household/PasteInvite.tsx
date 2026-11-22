import { useState } from 'react';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useNavigate } from 'react-router';
import { storeInviteToken, tokenFromHash } from '~/lib/inviteToken';

// The token from a whole link, or from the token on its own.
export function tokenFromPasted(text: string): string | undefined {
  const trimmed = text.trim();
  const hash = trimmed.includes('#') ? trimmed.slice(trimmed.indexOf('#')) : trimmed;
  return tokenFromHash(hash);
}

// For a person who has the link as text, not as something to tap: paste it here and carry on to the join page.
export function PasteInvite() {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [problem, setProblem] = useState(false);
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        const token = tokenFromPasted(text);
        if (!token) { setProblem(true); return; }
        storeInviteToken(token);
        navigate('/join');
      }}
    >
      <Stack>
        <TextInput
          label="Invite link"
          description="Paste the whole link here."
          value={text}
          onChange={event => { setText(event.currentTarget.value); setProblem(false); }}
          error={problem ? "That doesn't look like an invite link. Copy the whole link again." : undefined}
        />
        <Group><Button type="submit" disabled={text.trim() === ''}>Use this link</Button></Group>
        <Text size="sm">The link works once and lasts 7 days. Lost it? Ask them to make a new one in Settings.</Text>
      </Stack>
    </form>
  );
}
