import type { QueryFilters } from "../types.js";
import { buildSupabaseOrder } from "./order.js";
import { reference, type SupabaseQuery } from "./query.js";
import { listEmbedded } from "./select.js";
import { buildSupabaseWhere } from "./where.js";

/**
 * Applies pagination to a Supabase query builder.
 * PostgREST needs an upper bound, so `offset` can only be used together with `limit`.
 */
export function buildSupabaseRange<TQuery extends SupabaseQuery>(query: TQuery, limit?: number, offset?: number, path?: string): TQuery {
  const options = reference(path);

  if (limit === undefined) {
    if (offset !== undefined) {
      throw new Error("[@ormx/filters] Supabase requires a limit when an offset is set.");
    }
    return query;
  }

  if (offset === undefined) {
    return query.limit(limit, options) as TQuery;
  }

  return query.range(offset, offset + limit - 1, options) as TQuery;
}

/**
 * Applies QueryFilters to a Supabase query builder: where, order and pagination, on the table and on its embedded resources.
 * The columns themselves must be given to `.select()` beforehand with `buildSupabaseSelect`.
 *
 * @example
 * ```ts
 * const query = supabase.from("users").select(buildSupabaseSelect(filters.select));
 * const { data } = await buildSupabaseFilters(query, filters);
 * ```
 */
export function buildSupabaseFilters<TQuery extends SupabaseQuery, TEntity>(query: TQuery, filters: QueryFilters<TEntity>): TQuery {
  let output = query;

  output = buildSupabaseWhere(output, filters.where);
  output = buildSupabaseOrder(output, filters.order);
  output = buildSupabaseRange(output, filters.limit, filters.offset);

  for (const [path, nested] of listEmbedded(filters.select)) {
    output = buildSupabaseWhere(output, nested.where, path);
    output = buildSupabaseOrder(output, nested.order, path);
    output = buildSupabaseRange(output, nested.limit, nested.offset, path);
  }

  return output;
}
