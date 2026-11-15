import type { PlanMeal } from '../../src/meals/types';
import { useHousehold } from '~/lib/household';
import { notifyFields } from '~/lib/letThemKnow';
import { useMealMutation } from '~/lib/mutations';

export interface PlanActions {
  set(day: string, meal: PlanMeal): void;
  clear(day: string): void;
}

// Every plan action the screens can take. A plan change can carry "Let them know", like a shopping change.
export function usePlanActions(): PlanActions {
  const household = useHousehold();
  const planSet = useMealMutation('planSet');
  const by = household.data?.me.userId ?? '';
  const common = () => ({ mutationId: crypto.randomUUID(), at: Date.now(), by, ...notifyFields() });

  return {
    set: (day, meal) => planSet.mutate({ ...common(), day, meal }),
    clear: day => planSet.mutate({ ...common(), day, meal: null }),
  };
}
