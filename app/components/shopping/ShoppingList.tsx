import { Stack, Text } from '@mantine/core';
import type { ShoppingItem } from '../../../src/shopping/types';
import { sortItems } from '~/lib/items';
import { ItemRow } from './ItemRow';
import type { ItemRowProps } from './ItemRow';

export interface ShoppingListProps {
  items: ShoppingItem[];
  onTick: ItemRowProps['onTick'];
  onDelete: ItemRowProps['onDelete'];
  onEdit: ItemRowProps['onEdit'];
}

export function ShoppingList({ items, onTick, onDelete, onEdit }: ShoppingListProps) {
  const sorted = sortItems(items);
  if (sorted.length === 0) {
    return (
      <Stack>
        <Text>Nothing here yet.</Text>
        <Text size="sm">The household shopping list will be here.</Text>
      </Stack>
    );
  }
  return (
    <ul style={{ margin: 0, padding: 0 }}>
      {sorted.map(item => <ItemRow key={item.id} item={item} onTick={onTick} onDelete={onDelete} onEdit={onEdit} />)}
    </ul>
  );
}
