import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { NoticeBar } from '../NoticeBar';
import type { ProjectNotice } from '~/lib/projectNotices';

const notice: ProjectNotice = { id: 'n1', kind: 'replaced', projectId: 'p', recordId: 's', field: 'text', text: 'Buy more screws', at: 1 };
const show = () => render(<MantineProvider env="test"><NoticeBar notices={[notice]} userId="u" /></MantineProvider>);

afterEach(() => vi.unstubAllGlobals());

describe('NoticeBar copy', () => {
  it('says Copied when the words were copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith('Buy more screws');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('says so when it could not copy, so the person can do it by hand', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } });
    show();
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Could not copy. Select the words and copy them yourself.')).toBeInTheDocument();
  });
});
