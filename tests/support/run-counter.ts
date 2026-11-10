/**
 * Counts how many times each property body ran, so the test output shows the real number of
 * fast-check iterations per property. Wrap a property body with `counted('Property 5', fn)`.
 */
const counts = new Map<string, number>();

export function counted<A extends unknown[], R>(id: string, fn: (...args: A) => R): (...args: A) => R {
  return (...args: A): R => {
    counts.set(id, (counts.get(id) ?? 0) + 1);
    return fn(...args);
  };
}

/** One line per counted id, e.g. `[runs] Property 2: 300`. */
export function runSummary(file: string): string {
  const lines = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([id, n]) => `[runs] ${id}: ${n}`);
  return `${file}\n${lines.join('\n')}`;
}
