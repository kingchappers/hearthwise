import { hhPk } from '../household/keys';
import type { Key } from '../store';

export const MONEY_PREFIX = 'MONEY#';

export const moneyKey = (householdId: string, id: string): Key => ({ PK: hhPk(householdId), SK: `${MONEY_PREFIX}${id}` });
