import { ActionIcon, Menu } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { Link } from 'react-router';

export interface RecipeMenuProps {
  editHref: string;
  onDuplicate: () => void;
  onDelete: () => void;
}

export function RecipeMenu({ editHref, onDuplicate, onDelete }: RecipeMenuProps) {
  return (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon variant="subtle" size={44} aria-label="Recipe actions"><IconDots size={20} /></ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} to={editHref}>Edit</Menu.Item>
        <Menu.Item onClick={onDuplicate}>Duplicate</Menu.Item>
        <Menu.Item onClick={onDelete}>Delete</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
