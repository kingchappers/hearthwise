import { useEffect, useState } from 'react';
import { Alert, Anchor, Button, Group, Text } from '@mantine/core';
import { Link } from 'react-router';
import { hasPushSubscription, pushSupport } from '~/lib/push';
import { peekRuntimeConfig } from '~/lib/runtimeConfig';

const SEEN_KEY = 'hearthwise.pushPromptSeen';

function seen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1');
  } catch (error) {
    console.error('PushPrompt: could not remember that it was dismissed', error);
  }
}

// Shown once, on Today, to say notifications exist and where to turn them on. Nothing is turned on by it.
export function PushPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const possible = pushSupport() !== 'unsupported' && Boolean(peekRuntimeConfig()?.vapidPublicKey) && !seen();
    if (!possible) return undefined;
    void hasPushSubscription().then(already => { if (!cancelled && !already) setShow(true); });
    return () => { cancelled = true; };
  }, []);

  if (!show) return null;
  return (
    <Alert color="honey" title="Want a nudge?">
      <Text size="sm" mb="xs">Hearthwise can send a daily summary or tell you when the other person asks. It is all off until you turn it on.</Text>
      <Group>
        <Anchor component={Link} to="/settings#notifications" onClick={markSeen}>Notification settings</Anchor>
        <Button variant="default" onClick={() => { markSeen(); setShow(false); }}>Not now</Button>
      </Group>
    </Alert>
  );
}
