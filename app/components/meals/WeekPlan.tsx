import { useState } from 'react';
import { Button, Group, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import type { PlanDay, Recipe } from '../../../src/meals/types';
import { weekStart } from '../../../src/shared/schedule';
import { weekDays } from '~/lib/plan';
import { dayHeading, weekLabel } from '~/lib/planText';
import { DinnerLine } from './DinnerLine';

export interface WeekPlanProps {
  days: PlanDay[];
  recipes: Recipe[] | undefined;
  checkedAt: number | undefined;
  today: string;
  onOpen: (day: string) => void;
  // Opens the add-to-shopping-list review.
  onAddToList?: () => void;
}

const WEEKS = 5;

// The current week and the next four, Monday to Sunday, from today on. A later week with no dinner is one line until it is opened.
export function WeekPlan({ days, recipes, checkedAt, today, onOpen, onAddToList }: WeekPlanProps) {
  const start = weekStart(today);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  return (
    <Stack gap="md">
      {onAddToList && <Group><Button onClick={onAddToList}>Add to shopping list</Button></Group>}
      {Array.from({ length: WEEKS }, (_, week) => {
        const monday = weekDays(start, WEEKS * 7)[week * 7];
        // Days already gone are not listed. A later week with no dinner on any day is one line, and opens when asked.
        const shown = weekDays(monday, 7).filter(day => day >= today);
        const empty = week >= 2 && shown.every(day => days.find(candidate => candidate.day === day)?.meal === undefined);
        if (shown.length === 0) return null;
        if (empty && !opened.has(monday)) {
          return (
            <section key={monday}>
              <Title order={2} size="h5" mb={4}>{weekLabel(week, monday)}</Title>
              <Group gap="sm">
                <Text>Nothing planned yet</Text>
                <Button variant="default" style={{ minHeight: 44 }} onClick={() => setOpened(new Set([...opened, monday]))}>{`Show the days of ${weekLabel(week, monday)}`}</Button>
              </Group>
            </section>
          );
        }
        return (
          <section key={monday}>
            <Title order={2} size="h5" mb={4}>{weekLabel(week, monday)}</Title>
            <ul style={{ margin: 0, padding: 0 }}>
              {shown.map(day => {
                const plan = days.find(candidate => candidate.day === day);
                return (
                  <li key={day} style={{ listStyle: 'none' }}>
                    <UnstyledButton onClick={() => onOpen(day)} w="100%" mih={44} py={8} style={{ textAlign: 'left' }}>
                      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                        <Stack gap={0} miw={92}>
                          <Text fw={600}>{dayHeading(day)}</Text>
                          {day === today && <Text size="sm">Today</Text>}
                        </Stack>
                        <Stack gap={2} style={{ flex: 1 }}>
                          <DinnerLine plan={plan} recipes={recipes} checkedAt={checkedAt} />
                          {plan?.addedAt !== undefined && <Text size="sm">On the list</Text>}
                        </Stack>
                      </Group>
                    </UnstyledButton>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Stack>
  );
}
