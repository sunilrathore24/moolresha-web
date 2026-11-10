/**
 * Pure helper for `LastUpdated.astro` (Requirement 1.7): the latest `lastChecked`
 * date among a section's Fact_Registry entries. ISO dates (YYYY-MM-DD) sort
 * correctly as plain strings.
 */
export function latestChecked(dates: readonly string[]): string | undefined {
  let latest: string | undefined;
  for (const d of dates) {
    if (latest === undefined || d > latest) latest = d;
  }
  return latest;
}
