import { Group, Loader, Stack, Title } from '@mantine/core';
import { AddItem } from '~/components/shopping/AddItem';
import { ClearTicked } from '~/components/shopping/ClearTicked';
import { ShoppingList } from '~/components/shopping/ShoppingList';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { LoadError } from '~/components/layout/LoadError';
import { useItemActions } from '~/hooks/useItemActions';
import { useItems } from '~/lib/items';
import { pageTitle } from '~/lib/pageTitle';
import type { Route } from './+types/shopping';

export const meta: Route.MetaFunction = () => [{ title: pageTitle('Shopping') }];

function ShoppingContent() {
  const items = useItems();
  const actions = useItemActions();

  if (items.status === 'loading') return <Group justify="center" py="xl" role="status" aria-label="Loading the shopping list"><Loader /></Group>;
  if (items.status === 'error') return <LoadError thing="shopping list" onRetry={items.refetch} />;

  const ticked = items.items.filter(item => item.ticked && item.deletedAt === undefined);
  return (
    <Stack maw={640}>
      <Title order={1} size="h3">Shopping</Title>
      <AddItem onAdd={actions.add} />
      <ShoppingList items={items.items} onTick={actions.tick} onDelete={actions.remove} onEdit={actions.edit} />
      <ClearTicked count={ticked.length} onClear={() => actions.clearTicked(ticked)} />
    </Stack>
  );
}

export default function Shopping() {
  return (
    <DefaultLayout>
      <ShoppingContent />
    </DefaultLayout>
  );
}
