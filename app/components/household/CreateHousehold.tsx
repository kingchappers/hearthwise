import { useState } from 'react';
import { Alert, Button, NativeSelect, Stack, TextInput } from '@mantine/core';
import { useCreateHousehold } from '~/lib/household';

const MAX_NAME = 60;
const MAX_DISPLAY_NAME = 40;

function timeZones(current: string): string[] {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return supported.includes(current) ? supported : [current, ...supported];
}

function failureMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'already_member') return 'You already have a household.';
  return 'We could not create the household. Check your connection and try again.';
}

export function CreateHousehold({ defaultDisplayName }: { defaultDisplayName: string }) {
  const create = useCreateHousehold();
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState(defaultDisplayName);
  const [timezone, setTimezone] = useState(browserZone);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const household = name.trim();
    const person = displayName.trim();
    if (household.length < 1 || household.length > MAX_NAME) {
      setError(`Household name must be 1 to ${MAX_NAME} characters`);
      return;
    }
    if (person.length < 1 || Array.from(person).length > MAX_DISPLAY_NAME) {
      setError(`Your name must be 1 to ${MAX_DISPLAY_NAME} characters`);
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({ name: household, displayName: person, timezone });
    } catch (failure) {
      console.error('CreateHousehold: could not create the household', failure);
      setError(failureMessage(failure));
    }
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Household name" value={name} onChange={e => setName(e.currentTarget.value)} required withAsterisk={false} maxLength={MAX_NAME} autoComplete="off" />
        <TextInput label="Your name" description="How you will appear to your partner." value={displayName} onChange={e => setDisplayName(e.currentTarget.value)} required withAsterisk={false} maxLength={MAX_DISPLAY_NAME} autoComplete="name" />
        <NativeSelect
          label="Time zone"
          description="Used for dates and reminders. It is set from this device."
          data={timeZones(browserZone)}
          value={timezone}
          onChange={event => setTimezone(event.currentTarget.value)}
        />
        {error && <Alert color="honey" role="alert">{error}</Alert>}
        <Button type="submit" loading={create.isPending}>Create household</Button>
      </Stack>
    </form>
  );
}
