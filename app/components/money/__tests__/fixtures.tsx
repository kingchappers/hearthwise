import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { MoneyEntry } from '../../../../src/money/types';
import type { MoneyActions } from '~/hooks/useMoneyActions';
import type { People } from '~/lib/moneyText';

export const SAM = 'u-sam';
export const ALEX = 'u-alex';
export const people: People = { meId: SAM, meName: 'Sam', otherId: ALEX, otherName: 'Alex' };
export const TODAY = '2026-11-15';

let n = 0;
export const entry = (over: Partial<MoneyEntry> = {}): MoneyEntry => {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, kind: 'expense', paidBy: SAM, amountPence: 6340, sharePence: 3170, description: `Entry ${n}`, on: '2026-11-15',
    fieldTimes: {}, status: 'agreed', version: 2, createdBy: SAM, createdAt: 1_800_000_000_000, proposedBy: SAM, agreedAt: 1_800_000_100_000, agreedBy: ALEX,
    updatedAt: 1_800_000_100_000, updatedBy: ALEX, ...over,
  };
};

export const waitingForMe = (over: Partial<MoneyEntry> = {}): MoneyEntry =>
  entry({ status: 'waiting', paidBy: ALEX, proposedBy: ALEX, createdBy: ALEX, agreedBy: undefined, agreedAt: undefined, version: 1, ...over });

export function makeActions(over: Partial<MoneyActions> = {}): MoneyActions {
  return { add: vi.fn(), edit: vi.fn(), respond: vi.fn(), askChange: vi.fn(), respondChange: vi.fn(), withdrawChange: vi.fn(), remove: vi.fn(), restore: vi.fn(), ...over };
}

export const renderIn = (ui: React.ReactNode) => render(<MantineProvider env="test"><MemoryRouter>{ui}</MemoryRouter></MantineProvider>);
