import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useProtectedApi } from '~/hooks/useProtectedApi';
import { ApiError } from './apiError';
import type { HouseholdMeta, Member } from '../../src/household/types';
import type { MemberSettingsPatch } from '../../src/shared/household';

// The other member as the household list shows them: no settings, those are theirs.
export type MemberSummary = Pick<Member, 'userId' | 'displayName' | 'joinedAt'>;

export interface HouseholdData {
  household: HouseholdMeta;
  members: MemberSummary[];
  me: Member;
}

export interface OpenInvite {
  hash: string;
  createdBy: string;
  expiresAt: number;
}

export interface CreatedInvite {
  link: string;
  expiresAt: number;
  hash: string;
}

export const HOUSEHOLD_KEY = ['household'] as const;
const INVITES_KEY = ['household', 'invites'] as const;

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const isNoHousehold = (error: unknown): boolean => error instanceof ApiError && error.status === 403 && error.code === 'no_household';

export type HouseholdState = (
  | { status: 'loading' | 'none' | 'error'; data?: undefined }
  | { status: 'ready'; data: HouseholdData }
) & { refetch: () => void };

// "No household" is an answer, not a failure. Any other failure stays an error, so a network problem never sends someone
// to create a second household.
export function useHousehold(): HouseholdState {
  const { request } = useProtectedApi();
  const query = useQuery({
    queryKey: HOUSEHOLD_KEY,
    queryFn: async () => await request('/api/hh') as HouseholdData,
    retry: (count, error) => !isNoHousehold(error) && count < 1,
  });
  const refetch = () => { void query.refetch(); };
  if (query.data) return { status: 'ready', data: query.data, refetch };
  if (query.isError) return { status: isNoHousehold(query.error) ? 'none' : 'error', refetch };
  return { status: 'loading', refetch };
}

function useRefreshHousehold(): () => Promise<void> {
  const client = useQueryClient();
  // 'all', not the default 'active': the join page is outside the gate, so nothing is watching this query, and a stale "no household"
  // would send the person to the welcome page. The mutation resolves only once the fresh answer is in.
  return () => client.invalidateQueries({ queryKey: HOUSEHOLD_KEY, refetchType: 'all' });
}

export function useCreateHousehold() {
  const { request } = useProtectedApi();
  const refresh = useRefreshHousehold();
  return useMutation({
    mutationFn: async (input: { name: string; displayName: string; timezone: string }) =>
      await request('/api/households', json('POST', input)) as { householdId: string },
    onSuccess: refresh,
  });
}

export function useAcceptInvite() {
  const { request } = useProtectedApi();
  const refresh = useRefreshHousehold();
  return useMutation({
    mutationFn: async (input: { token: string; displayName: string; confirmMove?: boolean }) =>
      await request('/api/invites/accept', json('POST', input)) as { householdId: string },
    onSuccess: refresh,
  });
}

export function useInvites() {
  const { request } = useProtectedApi();
  return useQuery({
    queryKey: INVITES_KEY,
    queryFn: async () => (await request('/api/hh/invites') as { invites: OpenInvite[] }).invites,
  });
}

export function useCreateInvite() {
  const { request } = useProtectedApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => await request('/api/hh/invites', { method: 'POST' }) as CreatedInvite,
    onSuccess: () => client.invalidateQueries({ queryKey: INVITES_KEY }),
  });
}

export function useRevokeInvite() {
  const { request } = useProtectedApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (hash: string) => { await request(`/api/hh/invites/${hash}`, { method: 'DELETE' }); },
    onSuccess: () => client.invalidateQueries({ queryKey: INVITES_KEY }),
  });
}

export function useRemoveMember() {
  const { request } = useProtectedApi();
  const refresh = useRefreshHousehold();
  return useMutation({
    mutationFn: async (userId: string) => { await request(`/api/hh/members/${encodeURIComponent(userId)}`, { method: 'DELETE' }); },
    onSuccess: refresh,
  });
}

export function useUpdateMe() {
  const { request } = useProtectedApi();
  const refresh = useRefreshHousehold();
  return useMutation({
    mutationFn: async (patch: { displayName?: string; settings?: MemberSettingsPatch }) =>
      await request('/api/hh/members/me', json('PATCH', patch)) as { me: Member },
    onSuccess: refresh,
  });
}
