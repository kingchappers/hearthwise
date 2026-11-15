import { Stack } from '@mantine/core';
import { Outlet } from 'react-router';
import { DefaultLayout } from '~/components/layout/DefaultLayout';
import { PlanSwitch } from '~/components/calendar/PlanSwitch';

// The Plan tab: a switch between the week's dinners and the shared calendar, above whichever page is open.
export default function Plan() {
  return (
    <DefaultLayout>
      <Stack>
        <PlanSwitch />
        <Outlet />
      </Stack>
    </DefaultLayout>
  );
}
