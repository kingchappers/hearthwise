import { Group, Stack, Text, Title, UnstyledButton } from '@mantine/core';
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
}

const WEEKS = 5;

// The current week and the next four, Monday to Sunday. Earlier days of this week appear and can be changed.
export function WeekPlan({ days, recipes, checkedAt, today, onOpen }: WeekPlanProps) {
  const start = weekStart(today);
  return (
    <Stack gap="md">
      {Array.from({ length: WEEKS }, (_, week) => {
        const monday = weekDays(start, WEEKS * 7)[week * 7];
        return (
          <section key={monday}>
            <Title order={2} size="h5" mb={4}>{weekLabel(week, monday)}</Title>
            <ul style={{ margin: 0, padding: 0 }}>
              {weekDays(monday, 7).map(day => {
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
