import { Button } from '@mantine/core';
import type { Task } from '../../../src/tasks/types';

export interface DidThisTodayProps {
  task: Task;
  // Whether the task is the viewer's (or anyone's): "Done". Otherwise it is the other person's, and the viewer is doing it for them.
  own: boolean;
  onClick: () => void;
}

// One tap to say it was done, on every row and card. Done before its date or after, it completes the current cycle.
export function DidThisToday({ task, own, onClick }: DidThisTodayProps) {
  const label = own ? 'Done' : 'I did this today';
  return <Button variant="light" onClick={onClick} aria-label={`${label}: ${task.title}`}>{label}</Button>;
}
