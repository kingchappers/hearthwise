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
      description="Sends them a short message about the changes you make here."
      checked={box.on}
      onChange={event => box.set(event.currentTarget.checked)}
    />
  );
}
