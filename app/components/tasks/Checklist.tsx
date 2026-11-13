import { Checkbox, Stack } from '@mantine/core';
import type { Task } from '../../../src/tasks/types';

// A task's steps, ticked one by one. Each tick is saved on its own, so two people ticking different steps both keep their ticks.
export function Checklist({ task, onTick }: { task: Task; onTick: (stepId: string, done: boolean) => void }) {
  return (
    <Stack gap="xs">
      {task.checklist.map(step => (
        <Checkbox
          key={step.id}
          label={step.text}
          checked={task.checklistState[step.id]?.done === true}
          onChange={event => onTick(step.id, event.currentTarget.checked)}
        />
      ))}
    </Stack>
  );
}
