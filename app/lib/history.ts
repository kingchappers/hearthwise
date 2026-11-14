import { useQuery } from '@tanstack/react-query';
import type { CompletionHistory, EditHistory } from '../../src/tasks/history';
import { useProtectedApi } from '~/hooks/useProtectedApi';

export interface TaskHistoryData {
  completions: CompletionHistory[];
  edits: EditHistory[];
}

// What happened to one task: who did each cycle, and the other member's direct edits. Read when the task page opens.
export function useTaskHistory(taskId: string) {
  const { request } = useProtectedApi();
  return useQuery({
    queryKey: ['task-history', taskId],
    queryFn: async () => await request(`/api/hh/tasks/${taskId}/history`) as TaskHistoryData,
  });
}
