/**
 * Refuses a write whose filters build no condition at all, so an empty or fully skipped filter cannot silently affect every row.
 * Takes the condition produced by `@ormx/filters`, not the input filters: the builders drop blank values, disabled flags and empty `OneOf` groups, so only the built condition says what the database will actually receive.
 */
export function assertFiltered(condition: unknown, operation: string): void {
  const empty = condition === undefined || condition === null || (typeof condition === "object" && Object.keys(condition).length === 0);

  if (empty) {
    throw new Error(
      `[@ormx/datasources] ${operation}() requires a filter that matches at least one condition. Use an explicit condition such as { id: { IsNotNull: true } } to target every row.`,
    );
  }
}

/**
 * Returns the first row of a result set, or `null` when it is empty.
 */
export function first<TRow>(rows: TRow[]): TRow | null {
  return rows[0] ?? null;
}
