import { useState } from 'react';
import { Button, Checkbox, Group, Stack, Text, TextInput } from '@mantine/core';
import type { ShoppingItem } from '../../../src/shopping/types';
import { ResponsiveSheet } from '../layout/ResponsiveSheet';

export interface ItemRowProps {
  item: ShoppingItem;
  onTick: (item: ShoppingItem, done: boolean) => void;
  onDelete: (item: ShoppingItem) => void;
  onEdit: (item: ShoppingItem, changes: { text?: string; quantity?: string }) => void;
}

function EditForm({ item, onEdit, onClose }: { item: ShoppingItem; onEdit: ItemRowProps['onEdit']; onClose: () => void }) {
  const [text, setText] = useState(item.text);
  const [quantity, setQuantity] = useState(item.quantity ?? '');

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    const changes: { text?: string; quantity?: string } = {};
    if (text.trim() !== '' && text.trim() !== item.text) changes.text = text.trim();
    if (quantity.trim() !== (item.quantity ?? '')) changes.quantity = quantity.trim();
    if (Object.keys(changes).length > 0) onEdit(item, changes);
    onClose();
  }

  return (
    <form onSubmit={submit}>
      <Stack>
        <TextInput label="Item" value={text} onChange={event => setText(event.currentTarget.value)} maxLength={200} />
        <TextInput label="How many (optional)" value={quantity} onChange={event => setQuantity(event.currentTarget.value)} maxLength={40} />
        <Button type="submit">Save</Button>
      </Stack>
    </form>
  );
}

export function ItemRow({ item, onTick, onDelete, onEdit }: ItemRowProps) {
  const [editing, setEditing] = useState(false);
  return (
    <li style={{ listStyle: 'none' }}>
      <Group justify="space-between" wrap="nowrap" gap="xs" py={4}>
        <Checkbox
          size="md"
          checked={item.ticked}
          onChange={event => onTick(item, event.currentTarget.checked)}
          label={<span style={item.ticked ? { textDecoration: 'line-through' } : undefined}>{item.text}</span>}
          style={{ overflowWrap: 'anywhere' }}
        />
        <Group gap={4} wrap="nowrap">
          {item.quantity && <Text size="sm">{item.quantity}</Text>}
          <Button variant="subtle" aria-label={`Edit: ${item.text}`} onClick={() => setEditing(true)}>Edit</Button>
          <Button variant="subtle" aria-label={`Delete: ${item.text}`} onClick={() => onDelete(item)}>Delete</Button>
        </Group>
      </Group>
      <ResponsiveSheet opened={editing} onClose={() => setEditing(false)} title="Edit item">
        <EditForm item={item} onEdit={onEdit} onClose={() => setEditing(false)} />
      </ResponsiveSheet>
    </li>
  );
}
