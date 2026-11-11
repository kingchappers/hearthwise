import { Button, Card, Input, Radio, SegmentedControl, Stack, Switch, Text, Title, useMantineColorScheme } from '@mantine/core';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { useAuth } from '~/lib/auth';
import { usePreferences, type TextSize, type UndoDuration } from '~/lib/preferences';
import { TEXT_SIZE_OPTIONS } from '~/lib/textSize';
import { UNDO_DURATION_OPTIONS } from '~/lib/undoDuration';
import { SESSION_LIFETIME_TEXT } from '~/lib/sessionLifetime';
import { pageTitle } from '~/lib/pageTitle';
import type { Route } from './+types/settings';

const APPEARANCE_OPTIONS = [
  { value: 'auto', label: 'Match my device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

function SettingsContent() {
  const [preferences, setPreferences] = usePreferences();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const { logout } = useAuth();

  return (
    <Stack maw={640}>
      <Title order={1} size="h3">Settings</Title>
      <Text size="sm">Display settings are saved on this device.</Text>

      <Card withBorder>
        <Title order={2} size="h4" mb="sm">Signing in</Title>
        <Stack gap="sm" align="flex-start">
          <Text size="sm">{SESSION_LIFETIME_TEXT}</Text>
          <Button variant="default" onClick={() => void logout()}>Sign out</Button>
        </Stack>
      </Card>

      <Card withBorder>
        <Title order={2} size="h4" mb="sm">Display</Title>
        <Stack gap="md">
          <Input.Wrapper label="Text size" description="Makes text bigger everywhere. It changes straight away.">
            <SegmentedControl
              fullWidth
              mt={4}
              aria-label="Text size"
              value={preferences.textSize}
              onChange={value => setPreferences({ textSize: value as TextSize })}
              data={TEXT_SIZE_OPTIONS}
            />
          </Input.Wrapper>
          <Input.Wrapper label="Appearance" description="Light, dark, or whichever your device is set to.">
            <SegmentedControl
              fullWidth
              mt={4}
              aria-label="Appearance"
              value={colorScheme}
              onChange={value => setColorScheme(value as 'auto' | 'light' | 'dark')}
              data={APPEARANCE_OPTIONS}
            />
          </Input.Wrapper>
          <Switch
            label="Reduce motion"
            description="Stops sliding and fading when sheets, menus and messages open. The app already follows your device's setting; this switch turns it on for the app only."
            checked={preferences.reduceMotion}
            onChange={event => setPreferences({ reduceMotion: event.currentTarget.checked })}
          />
        </Stack>
      </Card>

      <Card withBorder>
        <Title order={2} size="h4" mb="sm">Messages</Title>
        <Radio.Group
          label="How long messages with an Undo button stay"
          description="Done and deleted messages. Problems always stay until you close them."
          value={preferences.undoDuration}
          onChange={value => setPreferences({ undoDuration: value as UndoDuration })}
        >
          <Stack mt="xs" gap="xs">
            {UNDO_DURATION_OPTIONS.map(option => (
              <Radio key={option.value} value={option.value} label={option.label} />
            ))}
          </Stack>
        </Radio.Group>
      </Card>
    </Stack>
  );
}

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Settings') }];

export default function Settings() {
  return (
    <DefaultLayout>
      <SettingsContent />
    </DefaultLayout>
  );
}
