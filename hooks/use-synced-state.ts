import { useState, type Dispatch, type SetStateAction } from "react";

// Prop changes reset the state: the server refetches after each mutation,
// so a new prop value always wins over local edits.
export function useSyncedState<T>(value: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState(value);
  const [restored, setRestored] = useState(value);
  if (value !== restored) {
    setRestored(value);
    setState(value);
  }
  return [state, setState];
}
