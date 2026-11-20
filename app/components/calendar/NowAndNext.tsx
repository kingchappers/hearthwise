import { Button, Paper, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import type { NowAndNext as NowAndNextResult } from '../../../src/shared/timeline';
import { nextText, nowText } from '~/lib/calendarText';

// The calendar's strip on Today: what is on now for the person, and what comes next, with a way into the calendar.
export function NowAndNext({ now, next }: NowAndNextResult) {
  return (
    <Paper withBorder p="md" radius="md" component="section" aria-labelledby="now-next-heading">
      <Stack gap="xs">
        <Title id="now-next-heading" order={2} size="h5">Now and next</Title>
        <Text>{nowText(now)}</Text>
        <Text>{nextText(next)}</Text>
        <Button component={Link} to="/plan/calendar" variant="light" style={{ minHeight: 44, alignSelf: 'flex-start' }}>Open the calendar</Button>
      </Stack>
    </Paper>
  );
}
