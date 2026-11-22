// "Little energy today": a switch on Today that makes the small things come first. Per person and per device, and it clears itself the next
// morning (it stores the day it was turned on, and means nothing on any other day), so it never lingers as a mood nobody asked to keep.
import { useCallback, useState } from 'react';
import { littleEnergyKey, readObject, writeObject } from './deviceKeys';

export function readLittleEnergy(userId: string, today: string): boolean {
  if (userId === '') return false;
  return readObject(littleEnergyKey(userId)).day === today;
}

export function writeLittleEnergy(userId: string, today: string, on: boolean): void {
  if (userId === '') return;
  writeObject(littleEnergyKey(userId), on ? { day: today } : {});
}

export function useLittleEnergy(userId: string, today: string): [boolean, (on: boolean) => void] {
  const [stored, setStored] = useState(() => readLittleEnergy(userId, today));
  // A day that has moved on since the page was opened turns it off again without a reload.
  const on = stored && readLittleEnergy(userId, today);
  const set = useCallback((next: boolean): void => {
    writeLittleEnergy(userId, today, next);
    setStored(next);
  }, [userId, today]);
  return [on, set];
}
