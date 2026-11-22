import { Checkbox, Text } from '@mantine/core';
import { useHousehold } from '~/lib/household';
import { useLetThemKnow } from '~/lib/letThemKnow';

// One tick for the changes made on this page. Hidden when there is nobody else to tell.
export function LetThemKnow() {
  const household = useHousehold();
  const box = useLetThemKnow();
  const data = household.data;
  const other = data?.members.find(member => member.userId !== data.me.userId);
  if (!other) return null;
  return (
    <>
      <Checkbox
        label={`Tell ${other.displayName} when I save a change`}
        description={`Sends ${other.displayName} one short message, then clears after each save. A task, shopping or dinner message names the item; money, calendar and project messages never do. It waits until their quiet hours end.`}
        checked={box.on}
        onChange={event => box.set(event.currentTarget.checked)}
      />
      {box.told && <Text size="sm" role="status">{`${other.displayName} was told.`}</Text>}
    </>
  );
}
