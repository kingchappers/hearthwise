import { ActionIcon, Menu } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';

export interface RecipeMenuProps {
  onDuplicate: () => void;
  onDelete: () => void;
}

export function RecipeMenu({ onDuplicate, onDelete }: RecipeMenuProps) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" size={44} aria-label="Recipe actions"><IconDots size={20} /></ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={onDuplicate}>Duplicate</Menu.Item>
        <Menu.Item onClick={onDelete}>Delete</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
