import { isNestedSelect } from "../shared";
import type { QueryFilters, Select } from "../types";

/**
 * Converts a generic Select clause into a PostgREST columns string, as expected by `.select()`.
 * Returns `undefined` when no field is selected, meaning all columns.
 *
 * @example
 * ```ts
 * buildSupabaseSelect({ id: true, posts: { select: { title: true } } });
 * // "id,posts(title)"
 * ```
 */
export function buildSupabaseSelect<TEntity>(select?: Select<TEntity>): string | undefined {
  if (!select) {
    return undefined;
  }

  const columns: string[] = [];

  for (const [field, value] of Object.entries(select)) {
    if (!value) {
      continue;
    }

    if (isNestedSelect(value)) {
      columns.push(`${field}(${buildSupabaseSelect(value.select) ?? "*"})`);
      continue;
    }

    columns.push(field);
  }

  return columns.length > 0 ? columns.join(",") : undefined;
}

/**
 * Lists the embedded resources of a Select clause with their nested filters, recursively, as dotted paths.
 */
export function listEmbedded<TEntity>(select: Select<TEntity> | undefined, path?: string): [path: string, filters: QueryFilters<unknown>][] {
  if (!select) {
    return [];
  }

  return Object.entries(select).flatMap(([field, value]) => {
    if (!isNestedSelect(value)) {
      return [];
    }

    const current = path ? `${path}.${field}` : field;

    return [[current, value] as [string, QueryFilters<unknown>], ...listEmbedded(value.select, current)];
  });
}
