import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { FeedView, ImportedData, ImportedView } from '../../src/calendar/types';
import { addDays, weekStart } from '../../src/shared/schedule';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { IMPORTED_KEY } from './calendarKeys';

const POLL_MS = 5 * 60_000;
const WINDOW_DAYS = 42;
const NO_OCCURRENCES: ImportedView[] = [];
const NO_FEEDS: FeedView[] = [];

export interface ImportedWindow {
  from: string;
  to: string;
}

// 42 days, inside the route's 62-day limit, from a week before the Monday of the day. Every day of a week reads the same window, so
// browsing a week costs one request, and the window stays saved for the offline case.
export function importedWindow(day: string): ImportedWindow {
  const from = addDays(weekStart(day), -7);
  return { from, to: addDays(from, WINDOW_DAYS - 1) };
}

export interface ImportedState {
  status: 'loading' | 'ready' | 'error';
  occurrences: ImportedView[];
  feeds: FeedView[];
  // The server's time for the last good read, which is what each feed's "Updated" is worked out against.
  updatedAt: number | undefined;
  // Whether a day is inside a window this device has saved. A day outside shows "Not saved for offline yet", never an empty day.
  covers: (day: string) => boolean;
  refetch: () => void;
}

// The imported events for the window around a day, refetched on focus and every five minutes. A failed refresh keeps the last good
// window. The data carries no link: a feed's address is never sent back, so the saved cache cannot hold one.
export function useImported(day: string): ImportedState {
  const { request } = useProtectedApi();
  const client = useQueryClient();
  const { from, to } = importedWindow(day);

  const query = useQuery({
    queryKey: [...IMPORTED_KEY, from, to],
    queryFn: async (): Promise<ImportedData> => await request(`/api/hh/calendar/imported?from=${from}&to=${to}`) as ImportedData,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const covers = (candidate: string): boolean => client.getQueriesData<ImportedData>({ queryKey: IMPORTED_KEY }).some(([key, data]) => {
    const [, start, end] = key as [string, string, string];
    return data !== undefined && candidate >= start && candidate <= end;
  });

  return {
    status: query.data ? 'ready' : query.isError ? 'error' : 'loading',
    occurrences: query.data?.occurrences ?? NO_OCCURRENCES,
    feeds: query.data?.feeds ?? NO_FEEDS,
    updatedAt: query.data?.serverTime,
    covers,
    refetch: () => { void query.refetch(); },
  };
}
