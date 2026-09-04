import type { QueryFilters } from "@ormx/filters";

/**
 * Refuses write operations without a where clause, so an empty filter cannot silently affect every row.
 */
export function assertFiltered(filters: QueryFilters<unknown>, operation: string): void {
  if (!filters.where || Object.keys(filters.where).length === 0) {
    throw new Error(
      `[@ormx/datasources] ${operation}() requires a where clause. Use an explicit condition such as { id: { IsNotNull: true } } to target every row.`,
    );
  }
}
