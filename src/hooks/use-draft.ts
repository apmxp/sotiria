import { useEffect, useState } from 'react';

/**
 * Local form state that follows its saved source value.
 * Saved demo data loads after the first render, so plain useState(source)
 * would keep showing the sample value; this re-syncs whenever the source changes.
 */
export function useDraft<T>(source: T) {
  const [value, setValue] = useState(source);
  useEffect(() => setValue(source), [source]);
  return [value, setValue] as const;
}
