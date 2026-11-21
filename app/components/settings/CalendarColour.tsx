import { Group, Radio, Stack, Text } from '@mantine/core';
import { MARK_COLOURS } from '../../../src/shared/household';
import type { MarkColour } from '../../../src/shared/household';
import { COLOUR_FILL, COLOUR_NAMES, colourOfMember, initialOf } from '~/lib/calendarPeople';
import { useHousehold, useUpdateMe } from '~/lib/household';

// The colour of your items on the calendar, chosen from the brand's palette. The other person sees it too, so it is kept with your name,
// not with the settings that are yours alone. The letter and your name stay on every card, so colour is never the only sign.
export function CalendarColour() {
  const household = useHousehold();
  const update = useUpdateMe();
  const me = household.data?.me;
  if (!me) return null;
  const members = household.data?.members ?? [];
  const other = members.find(member => member.userId !== me.userId);
  const current = colourOfMember(me, members.length > 0 ? members : [me]);

  return (
    <Radio.Group
      label="Your colour on the calendar"
      description={`Your items carry this colour, your name and the letter ${initialOf(me.displayName)}. ${other?.displayName ?? 'The other person'} sees this colour too.`}
      value={current}
      onChange={value => { update.mutateAsync({ colour: value as MarkColour }).catch((error: unknown) => console.error('CalendarColour: could not save', error)); }}
    >
      <Stack mt="xs" gap="xs">
        {MARK_COLOURS.map(colour => (
          <Radio
            key={colour}
            value={colour}
            label={
              <Group gap="xs" wrap="nowrap">
                <span aria-hidden="true" style={{ ...COLOUR_FILL[colour], display: 'inline-block', width: 20, height: 20, borderRadius: '50%', flex: 'none' }} />
                <Text component="span">{COLOUR_NAMES[colour]}</Text>
              </Group>
            }
          />
        ))}
      </Stack>
    </Radio.Group>
  );
}
