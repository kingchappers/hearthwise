import { useRef, useState } from 'react';
import { Button, Group, TextInput } from '@mantine/core';

const MAX_TEXT = 200;
const MAX_QUANTITY = 40;

// The field stays focused after an add, so a list can be typed in one item after another.
export function AddItem({ onAdd }: { onAdd: (text: string, quantity?: string) => void }) {
  const [text, setText] = useState('');
  const [quantity, setQuantity] = useState('');
  const textRef = useRef<HTMLInputElement>(null);

  function submit(event: React.FormEvent): void {
    event.preventDefault();
    const name = text.trim();
    if (name === '') return;
    onAdd(name, quantity.trim() === '' ? undefined : quantity.trim());
    setText('');
    setQuantity('');
    textRef.current?.focus();
  }

  return (
    <form onSubmit={submit}>
      <Group align="flex-end" wrap="wrap" gap="xs">
        <TextInput ref={textRef} style={{ flex: '1 1 200px' }} label="Add an item" value={text} onChange={event => setText(event.currentTarget.value)} maxLength={MAX_TEXT} autoComplete="off" enterKeyHint="done" />
        <TextInput style={{ flex: '0 1 140px' }} label="How many (optional)" value={quantity} onChange={event => setQuantity(event.currentTarget.value)} maxLength={MAX_QUANTITY} autoComplete="off" />
        <Button type="submit">Add</Button>
      </Group>
    </form>
  );
}
