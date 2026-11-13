import { Chip, Group, NativeSelect, NumberInput, Stack } from '@mantine/core';
import { WEEKDAYS } from '../../../src/shared/schedule';
import type { Repeat, Weekday } from '../../../src/shared/schedule';

type Kind = 'none' | 'after' | 'day' | 'week' | 'month';

const KINDS: { value: Kind; label: string }[] = [
  { value: 'none', label: "Doesn't repeat" },
  { value: 'after', label: "Some days after it's done" },
  { value: 'day', label: 'Every few days' },
  { value: 'week', label: 'Every few weeks, on set days' },
  { value: 'month', label: 'Every few months, on a set day' },
];

const WEEKDAY_NAMES: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

const kindOf = (repeat: Repeat): Kind => (repeat.type === 'fixed' ? repeat.unit : repeat.type);

function weekdayOf(day: string): Weekday {
  return WEEKDAYS[(new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7];
}

function starting(kind: Kind, today: string): Repeat {
  if (kind === 'none') return { type: 'none' };
  if (kind === 'after') return { type: 'after', days: 1 };
  if (kind === 'week') return { type: 'fixed', every: 1, unit: 'week', weekdays: [weekdayOf(today)], startOn: today };
  return { type: 'fixed', every: 1, unit: kind, startOn: today };
}

export interface RepeatPickerProps {
  value: Repeat;
  today: string;
  onChange: (repeat: Repeat) => void;
}

export function RepeatPicker({ value, today, onChange }: RepeatPickerProps) {
  const kind = kindOf(value);
  const number = (raw: string | number): number => (typeof raw === 'number' ? raw : Number(raw) || 1);

  return (
    <Stack gap="xs">
      <NativeSelect
        label="Repeat"
        data={KINDS}
        value={kind}
        onChange={event => onChange(starting(event.currentTarget.value as Kind, today))}
      />
      {value.type === 'after' && (
        <NumberInput label="Days after it is done" min={1} max={365} allowDecimal={false} value={value.days} onChange={raw => onChange({ type: 'after', days: number(raw) })} />
      )}
      {value.type === 'fixed' && (
        <>
          <NumberInput label="Every" description={`Number of ${value.unit}s`} min={1} max={52} allowDecimal={false} value={value.every} onChange={raw => onChange({ ...value, every: number(raw) })} />
          {value.unit === 'week' && (
            <Chip.Group multiple value={value.weekdays ?? []} onChange={days => onChange({ ...value, weekdays: days.length > 0 ? (days as Weekday[]) : value.weekdays })}>
              <Group gap="xs" role="group" aria-label="On these days">
                {WEEKDAYS.map(day => <Chip key={day} value={day}>{WEEKDAY_NAMES[day]}</Chip>)}
              </Group>
            </Chip.Group>
          )}
          {value.unit === 'month' && (
            <NumberInput label="Day of the month" min={1} max={31} allowDecimal={false} value={value.dayOfMonth ?? ''} onChange={raw => onChange({ ...value, dayOfMonth: raw === '' ? undefined : number(raw) })} />
          )}
        </>
      )}
    </Stack>
  );
}
