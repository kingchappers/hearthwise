import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { ShoppingItem } from '../../../../src/shopping/types';
import { AddItem } from '../AddItem';
import { ClearTicked } from '../ClearTicked';
import { ItemRow } from '../ItemRow';
import { ShoppingList } from '../ShoppingList';

const item = (over: Partial<ShoppingItem> = {}): ShoppingItem => ({ id: `i-${Math.random()}`, text: 'Milk', ticked: false, fieldTimes: { text: 1 }, updatedAt: 1, ...over });
const renderIn = (ui: React.ReactNode) => render(<MantineProvider env="test">{ui}</MantineProvider>);
const noSmallButtons = () => { for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs'); };

describe('AddItem', () => {
  it('adds the typed item with its quantity, clears the fields and keeps the cursor in the first', async () => {
    const onAdd = vi.fn();
    renderIn(<AddItem onAdd={onAdd} />);
    const text = screen.getByLabelText('Add an item');
    await userEvent.type(text, '  Milk ');
    await userEvent.type(screen.getByLabelText('How many (optional)'), '2 litres');
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).toHaveBeenCalledWith('Milk', '2 litres');
    expect(text).toHaveValue('');
    expect(screen.getByLabelText('How many (optional)')).toHaveValue('');
    expect(text).toHaveFocus();
  });

  it('adds with Enter, with no quantity when none was typed, and does nothing for an empty name', async () => {
    const onAdd = vi.fn();
    renderIn(<AddItem onAdd={onAdd} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onAdd).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText('Add an item'), 'Eggs{Enter}');
    expect(onAdd).toHaveBeenCalledWith('Eggs', undefined);
  });

  it('limits what can be typed to the length the server accepts', () => {
    renderIn(<AddItem onAdd={vi.fn()} />);
    expect(screen.getByLabelText('Add an item')).toHaveAttribute('maxlength', '200');
    expect(screen.getByLabelText('How many (optional)')).toHaveAttribute('maxlength', '40');
  });
});

describe('ItemRow', () => {
  const renderRow = (over: Partial<ShoppingItem> = {}, handlers = { onTick: vi.fn(), onDelete: vi.fn(), onEdit: vi.fn() }) => {
    const entry = item(over);
    renderIn(<ul><ItemRow item={entry} {...handlers} /></ul>);
    return { entry, ...handlers };
  };

  it('shows the name and quantity, ticks and unticks with one tap, and deletes', async () => {
    const { entry, onTick, onDelete } = renderRow({ text: 'Milk', quantity: '2 litres' });
    expect(screen.getByText('2 litres')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Milk/ }));
    expect(onTick).toHaveBeenCalledWith(entry, true);
    await userEvent.click(screen.getByRole('button', { name: 'Delete: Milk' }));
    expect(onDelete).toHaveBeenCalledWith(entry);
  });

  it('shows a ticked item as ticked, and unticks it', async () => {
    const { entry, onTick } = renderRow({ ticked: true });
    expect(screen.getByRole('checkbox', { name: /Milk/ })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: /Milk/ }));
    expect(onTick).toHaveBeenCalledWith(entry, false);
  });

  it('edits the name and quantity in a sheet, sending only what changed', async () => {
    const { entry, onEdit } = renderRow({ text: 'Milk', quantity: '1' });
    await userEvent.click(screen.getByRole('button', { name: 'Edit: Milk' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit item' });
    await userEvent.clear(within(dialog).getByLabelText('Item'));
    await userEvent.type(within(dialog).getByLabelText('Item'), 'Oat milk');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(onEdit).toHaveBeenCalledWith(entry, { text: 'Oat milk' });
  });

  it('has no small buttons', () => {
    renderRow();
    noSmallButtons();
  });
});

describe('ShoppingList', () => {
  const handlers = { onTick: vi.fn(), onDelete: vi.fn(), onEdit: vi.fn() };

  it('lists unticked items first and ticked ones last', () => {
    renderIn(<ShoppingList items={[item({ text: 'Bread', ticked: true }), item({ text: 'Eggs' }), item({ text: 'Apples' })]} {...handlers} />);
    expect(screen.getAllByRole('listitem').map(row => row.textContent)).toEqual([expect.stringContaining('Apples'), expect.stringContaining('Eggs'), expect.stringContaining('Bread')]);
  });

  it('says what will appear when there is nothing', () => {
    renderIn(<ShoppingList items={[]} {...handlers} />);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
    expect(screen.getByText('The household shopping list will be here.')).toBeInTheDocument();
  });

  it('never says overdue, missed or streak', () => {
    renderIn(<ShoppingList items={[item()]} {...handlers} />);
    expect(document.body.textContent).not.toMatch(/overdue|missed|streak/i);
  });
});

describe('ClearTicked', () => {
  it('shows nothing when nothing is ticked', () => {
    renderIn(<ClearTicked count={0} onClear={vi.fn()} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows how many are ticked, and clears them', async () => {
    const onClear = vi.fn();
    renderIn(<ClearTicked count={3} onClear={onClear} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear ticked (3)' }));
    expect(onClear).toHaveBeenCalledTimes(1);
    noSmallButtons();
  });
});
