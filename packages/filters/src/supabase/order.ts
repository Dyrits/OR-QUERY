import type { Order } from "../types";
import { reference, type SupabaseQuery } from "./query";

/**
 * Applies a generic Order clause to a Supabase query builder.
 * Pass `path` to sort rows of an embedded resource instead of the top-level table.
 */
export function buildSupabaseOrder<TQuery extends SupabaseQuery, TEntity>(query: TQuery, order?: Order<TEntity>, path?: string): TQuery {
  if (!order) {
    return query;
  }

  let output: SupabaseQuery = query;

  for (const [field, direction] of Object.entries(order)) {
    if (!direction) {
      continue;
    }

    output = output.order(field, { ascending: direction === "asc", ...reference(path) });
  }

  return output as TQuery;
}
