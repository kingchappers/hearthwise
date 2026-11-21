import { useMemo } from 'react';
import { useMutationState, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EventOrBusy, EventsData, EventView } from '../../src/calendar/types';
import { dayInZone } from '../../src/shared/schedule';
import type { TimelineInputs } from '../../src/shared/timeline';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { CALENDAR_KEY, calendarMutationKeys } from './calendarKeys';
import { applyPendingCalendar } from './calendarOverlay';
import { useImported } from './imported';
import type { ImportedState } from './imported';
import { useHousehold } from './household';
import type { MemberSummary } from './household';
import type { CalendarMutationVars } from './mutations';
import type { PendingMutation } from './overlay';
import { displayTitle, usePlan } from './plan';
import { currentSettledCount, useTasks } from './queries';
import { useNow } from './useNow';

export { CALENDAR_KEY };

const POLL_MS = 10_000;
const NONE: EventOrBusy[] = [];
const NO_DELETED: EventView[] = [];

export interface CalendarState {
  status: 'loading' | 'ready' | 'error';
  // Every live event as the person may see it, with every pending write laid over: someone else's private event is a busy view.
  events: EventOrBusy[];
  // The deleted events the person may restore, with pending writes laid over.
  deleted: EventView[];
  // The server's list with nothing laid over it.
  serverEvents: EventOrBusy[];
  me: string;
  members: Pick<MemberSummary, 'userId' | 'displayName' | 'colour'>[];
  timezone: string;
  today: string;
  // How many calendar writes are waiting to be saved, and which events they are about.
  unsaved: number;
  unsavedIds: ReadonlySet<string>;
  dataUpdatedAt: number | undefined;
  refetch: () => void;
}

function idsOf(kind: string | undefined, variables: unknown): string[] {
  if (kind === 'createEvent') return [(variables as CalendarMutationVars['createEvent']).event.id];
  if (kind === 'eventRestore') return (variables as CalendarMutationVars['eventRestore']).entries.map(entry => entry.id);
  const id = (variables as { eventId?: string }).eventId;
  return id === undefined ? [] : [id];
}

// The household's events as the person sees them: the server's list with every pending write laid over it, polled every 10 seconds
// while the app is visible, like tasks, shopping and the plan. The list holds definitions, not occurrences; the timeline expands them.
export function useCalendar(): CalendarState {
  const { request } = useProtectedApi();
  const client = useQueryClient();
  const household = useHousehold();
  const now = useNow();

  const query = useQuery({
    queryKey: CALENDAR_KEY,
    queryFn: async (): Promise<EventsData> => {
      const startedAt = currentSettledCount();
      const fresh = await request('/api/hh/calendar') as EventsData;
      const previous = client.getQueryData<EventsData>(CALENDAR_KEY);
      // A response that started before a write settled may not include it: keep what is on screen.
      return currentSettledCount() !== startedAt && previous ? previous : fresh;
    },
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const pending = useMutationState<PendingMutation>({
    filters: { status: 'pending', mutationKey: ['household'] },
    select: mutation => ({ mutationKey: mutation.options.mutationKey, variables: mutation.state.variables }),
  });
  const calendarPending = useMemo(() => pending.filter(mutation => typeof mutation.mutationKey?.[1] === 'string' && mutation.mutationKey[1] in calendarMutationKeys), [pending]);
  const data = useMemo(() => (query.data ? applyPendingCalendar(query.data, calendarPending) : undefined), [query.data, calendarPending]);

  const unsavedIds = useMemo(
    () => new Set(calendarPending.flatMap(({ mutationKey, variables }) => idsOf(mutationKey?.[1] as string | undefined, variables))),
    [calendarPending],
  );

  const timezone = household.data?.household.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  return {
    status: data ? 'ready' : query.isError ? 'error' : 'loading',
    events: data?.events ?? NONE,
    deleted: data?.deleted ?? NO_DELETED,
    serverEvents: query.data?.events ?? NONE,
    me: household.data?.me.userId ?? '',
    members: household.data?.members ?? [],
    timezone,
    today: dayInZone(now, timezone),
    unsaved: calendarPending.length,
    unsavedIds,
    dataUpdatedAt: query.dataUpdatedAt || undefined,
    refetch: () => { void query.refetch(); },
  };
}

export interface TimelineSources {
  status: CalendarState['status'];
  calendar: CalendarState;
  // The imported window for the day shown. It is read on its own: a failed or slow window never holds back the events.
  imported: ImportedState;
  // What the timeline reads for a day: the events, the tasks and the dinner planned for it.
  inputsFor: (day: string) => TimelineInputs;
}

// The calendar's events with the tasks and the plan, which each keep their own cache and poll. A task list or plan that has not
// loaded is an empty strip, never a reason to hide the events. `day` is the day on screen, which picks the imported window.
export function useTimelineSources(day?: string): TimelineSources {
  const calendar = useCalendar();
  const imported = useImported(day ?? calendar.today);
  const tasks = useTasks();
  const plan = usePlan();
  return {
    status: calendar.status,
    calendar,
    imported,
    inputsFor: forDay => {
      const planned = plan.days.find(candidate => candidate.day === forDay);
      const title = planned ? displayTitle(planned, plan.recipes) : undefined;
      return {
        events: calendar.events, tasks: tasks.tasks, members: calendar.members, imported: imported.occurrences, feeds: imported.feeds, timezone: calendar.timezone,
        ...(title === undefined ? {} : { dinner: { title } }),
      };
    },
  };
}
