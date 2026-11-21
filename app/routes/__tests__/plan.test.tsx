import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expectNoViolations } from '~/test-utils/accessibility';

vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import Plan from '../plan';

function renderAt(path: string) {
  return render(
    <MantineProvider env="test">
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/plan" element={<Plan />}>
            <Route index element={<p>dinners child</p>} />
            <Route path="calendar" element={<p>calendar child</p>} />
            <Route path="projects" element={<p>projects child</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('the Plan layout', () => {
  it('has a Dinners and Calendar switch above whichever page is open', () => {
    renderAt('/plan');
    const nav = screen.getByRole('navigation', { name: 'Plan pages' });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dinners' })).toHaveAttribute('href', '/plan');
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', '/plan/calendar');
    expect(screen.getByText('dinners child')).toBeInTheDocument();
  });

  it('has a Projects link, marked as the open page on /plan/projects', () => {
    renderAt('/plan/projects');
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('href', '/plan/projects');
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('projects child')).toBeInTheDocument();
  });

  it('marks the open page with aria-current, so it is not told apart by colour alone', () => {
    const first = renderAt('/plan');
    expect(screen.getByRole('link', { name: 'Dinners' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Calendar' })).not.toHaveAttribute('aria-current');
    first.unmount();
    renderAt('/plan/calendar');
    expect(screen.getByText('calendar child')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dinners' })).not.toHaveAttribute('aria-current');
  });

  it('keeps each link at least 44px tall, and has no accessibility violations', async () => {
    const { container } = renderAt('/plan');
    for (const link of screen.getAllByRole('link')) expect(link).toHaveStyle({ minHeight: '44px' });
    await expectNoViolations(container);
  });
});
