import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { expectNoViolations } from '~/test-utils/accessibility';
import { NowAndNext } from '../NowAndNext';
import { renderIn } from './fixtures';

describe('NowAndNext', () => {
  it('says what is on and what is next, and links to the calendar with a 44px target', () => {
    renderIn(<NowAndNext now={undefined} next={undefined} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Now and next' })).toBeInTheDocument();
    expect(screen.getByText('Now: nothing on')).toBeInTheDocument();
    expect(screen.getByText('Nothing more today')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Open the calendar' });
    expect(link).toHaveAttribute('href', '/plan/calendar');
    expect(link).toHaveStyle({ minHeight: '44px' });
  });

  it('has no accessibility violations', async () => {
    const { container } = renderIn(<NowAndNext now={undefined} next={undefined} />);
    await expectNoViolations(container);
  });
});
