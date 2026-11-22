import { Checkbox } from '@mantine/core';
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
    <Checkbox
      label={`Let ${other.displayName} know`}
      description="Sends them one message for each change you save while you are on this page. A task, shopping or dinner message names the item; money, calendar and project messages never do. It waits until their quiet hours end."
      checked={box.on}
      onChange={event => box.set(event.currentTarget.checked)}
    />
  );
}
