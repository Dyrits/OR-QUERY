import type { SQL } from "drizzle-orm";
import type { QueryFilters } from "../types";
import type { ColumnSource } from "./columns";
import { buildDrizzleOrder } from "./order";
import { buildDrizzleSelect, type DrizzleSelect } from "./select";
import { buildDrizzleWhere } from "./where";

export type DrizzleFilters<TSource extends ColumnSource = ColumnSource> = {
  where: SQL | undefined;
  select: DrizzleSelect<TSource> | undefined;
  orderBy: SQL[];
  limit: number | undefined;
  offset: number | undefined;
};

/**
 * Converts QueryFilters to Drizzle query parts.
 *
 * @example
 * ```ts
 * const { where, orderBy } = buildDrizzleFilters(filters, users);
 *
 * db.select().from(users).where(where).orderBy(...orderBy);
 * ```
 */
export function buildDrizzleFilters<TEntity, TSource extends ColumnSource = ColumnSource>(filters: QueryFilters<TEntity>, columns: TSource): DrizzleFilters<TSource> {
  return {
    limit: filters.limit,
    offset: filters.offset,
    orderBy: buildDrizzleOrder(filters.order, columns),
    select: buildDrizzleSelect(filters.select, columns),
    where: buildDrizzleWhere(filters.where, columns),
  };
}
