import { useEffect, useState } from 'react';
import { Alert, Button, List, Stack, Text, Title } from '@mantine/core';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { hasPushSubscription, pushSupport, subscribeToPush, unsubscribeFromPush } from '~/lib/push';
import { peekRuntimeConfig } from '~/lib/runtimeConfig';

const permission = (): NotificationPermission | 'unavailable' => (typeof Notification === 'undefined' ? 'unavailable' : Notification.permission);

// Whether this device can get notifications, and the button to turn them on or off for it.
export function PushCheck() {
  const { request } = useProtectedApi();
  const [subscribed, setSubscribed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const support = pushSupport();
  const vapidPublicKey = peekRuntimeConfig()?.vapidPublicKey;

  useEffect(() => {
    let cancelled = false;
    if (support === 'supported') void hasPushSubscription().then(has => { if (!cancelled) setSubscribed(has); });
    return () => { cancelled = true; };
  }, [support]);

  if (support === 'needs-install') {
    return (
      <Stack gap="xs">
        <Title order={3} size="h5">Add Hearthwise to your Home Screen</Title>
        <Text size="sm">On an iPhone, notifications only work for an app on the Home Screen.</Text>
        <List type="ordered" size="sm" spacing={4}>
          <List.Item>In Safari, tap the Share button.</List.Item>
          <List.Item>Choose Add to Home Screen.</List.Item>
          <List.Item>Open Hearthwise from the Home Screen, then come back to this page.</List.Item>
        </List>
      </Stack>
    );
  }
  if (support === 'unsupported') return <Text size="sm">This browser can't get notifications. Chrome, Edge, Firefox and Safari can.</Text>;
  if (!vapidPublicKey) return <Text size="sm">This server isn't set up for notifications.</Text>;
  if (permission() === 'denied') return <Text size="sm">Notifications are blocked for this site on this device. Allow them in your browser's site settings, then come back.</Text>;

  async function turnOn(): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        setProblem('Notifications were not allowed, so none will be sent.');
        return;
      }
      await subscribeToPush(vapidPublicKey!, request);
      setSubscribed(true);
    } catch (error) {
      console.error('PushCheck: could not turn on notifications', error);
      setProblem("We couldn't turn on notifications. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff(): Promise<void> {
    setBusy(true);
    setProblem(null);
    try {
      await unsubscribeFromPush(request);
      setSubscribed(false);
    } catch (error) {
      console.error('PushCheck: could not turn off notifications', error);
      setProblem("We couldn't turn off notifications. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap="xs" align="flex-start">
      {subscribed
        ? <><Text size="sm">Notifications are on for this device.</Text><Button variant="default" loading={busy} onClick={() => void turnOff()}>Turn off notifications on this device</Button></>
        : <><Text size="sm">Notifications are off for this device.</Text><Button loading={busy} onClick={() => void turnOn()}>Turn on notifications on this device</Button></>}
      {problem && <Alert color="honey" role="alert">{problem}</Alert>}
    </Stack>
  );
}
