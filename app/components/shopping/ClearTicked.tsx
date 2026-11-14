import { Button, Group } from '@mantine/core';

export function ClearTicked({ count, onClear }: { count: number; onClear: () => void }) {
  if (count === 0) return null;
  return <Group><Button variant="default" onClick={onClear}>{`Clear ticked (${count})`}</Button></Group>;
}
