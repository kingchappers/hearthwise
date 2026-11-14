import { Input, SegmentedControl } from '@mantine/core';
import { useHousehold, useUpdateMe } from '~/lib/household';

// Which view Today opens with. It is yours alone; the other person keeps their own.
export function DefaultView() {
  const household = useHousehold();
  const update = useUpdateMe();
  const view = household.data?.me.settings.defaultView;
  if (!view) return null;
  return (
    <Input.Wrapper label="Today opens with" description="You can switch on the page any time. This is where it starts.">
      <SegmentedControl
        fullWidth
        mt={4}
        aria-label="Today opens with"
        value={view}
        onChange={value => { update.mutateAsync({ settings: { defaultView: value as 'list' | 'next' } }).catch((error: unknown) => console.error('DefaultView: could not save', error)); }}
        data={[{ value: 'list', label: 'Full list' }, { value: 'next', label: 'Next thing' }]}
      />
    </Input.Wrapper>
  );
}
