import { useState } from 'react';
import { Button, Group, Stack, TextInput } from '@mantine/core';
import { MAX_BECAUSE } from '../../../src/shared/moneyValidation';

export interface AskWithReasonProps {
  otherName: string;
  disabled: boolean;
  // The name of the entry, so each button can be told apart by a screen reader.
  name: string;
  onAsk: (because: string | undefined) => void;
}

// A second way to ask the other person to check an entry: the same ask, with a few words on why. The plain button beside it stays one tap.
export function AskWithReason({ otherName, disabled, name, onAsk }: AskWithReasonProps) {
  const [open, setOpen] = useState(false);
  const [because, setBecause] = useState('');
  if (!open) {
    return <Button variant="subtle" style={{ minHeight: 44 }} disabled={disabled} aria-label={`Ask ${otherName} to check, and say why: ${name}`} onClick={() => setOpen(true)}>Say why</Button>;
  }
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        onAsk(because.trim() === '' ? undefined : because.trim());
        setOpen(false);
        setBecause('');
      }}
    >
      <Stack gap="xs">
        <TextInput label="Because (optional)" description={`${otherName} sees this under the entry.`} value={because} onChange={event => setBecause(event.currentTarget.value)} maxLength={MAX_BECAUSE} autoFocus />
        <Group gap="xs">
          <Button type="submit" style={{ minHeight: 44 }} disabled={disabled}>{`Ask ${otherName} to check`}</Button>
          <Button variant="default" style={{ minHeight: 44 }} onClick={() => { setOpen(false); setBecause(''); }}>Cancel</Button>
        </Group>
      </Stack>
    </form>
  );
}
