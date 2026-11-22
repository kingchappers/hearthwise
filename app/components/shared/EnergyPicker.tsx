import { Input, SegmentedControl } from '@mantine/core';
import { ENERGY_LABELS, ENERGY_SIZES, isEnergy, type Energy } from '../../../src/shared/energy';

const NOT_SET = 'none';

export interface EnergyPickerProps {
  value: Energy | undefined;
  onChange: (value: Energy | undefined) => void;
}

// How big this feels to do. Optional, nobody else is told, and nothing is scored: it only lets "Little energy today" offer the small things first.
export function EnergyPicker({ value, onChange }: EnergyPickerProps) {
  return (
    <Input.Wrapper label="How big does it feel?" description="Optional. Your own guess; it only helps on days with little energy.">
      <SegmentedControl
        fullWidth
        mt={4}
        aria-label="How big does it feel?"
        value={value ?? NOT_SET}
        onChange={next => onChange(isEnergy(next) ? next : undefined)}
        data={[{ value: NOT_SET, label: 'Not set' }, ...ENERGY_SIZES.map(size => ({ value: size, label: ENERGY_LABELS[size] }))]}
      />
    </Input.Wrapper>
  );
}
