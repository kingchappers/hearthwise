import { Group } from '@mantine/core';
import { NavLink } from 'react-router';

const LINK = { display: 'inline-flex', alignItems: 'center', minHeight: 44, paddingInline: 12, textDecoration: 'none', color: 'inherit' } as const;

// The two pages of the Plan tab. The open one is bold with a bar under it, and says so to a screen reader: it is not told apart by
// colour alone. The Plan tab already uses a calendar icon for dinners, so the words matter.
export function PlanSwitch() {
  return (
    <nav aria-label="Plan pages">
      <Group gap="xs">
        {[{ to: '/plan', label: 'Dinners', end: true }, { to: '/plan/calendar', label: 'Calendar', end: false }].map(({ to, label, end }) => (
          <NavLink
            key={to} to={to} end={end}
            style={({ isActive }) => ({ ...LINK, fontWeight: isActive ? 700 : 400, borderBottom: `3px solid ${isActive ? 'currentColor' : 'transparent'}` })}
          >
            {label}
          </NavLink>
        ))}
      </Group>
    </nav>
  );
}
