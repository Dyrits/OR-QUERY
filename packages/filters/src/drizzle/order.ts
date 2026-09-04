import { asc, desc, type SQL } from "drizzle-orm";
import type { Order } from "../types.js";
import { type ColumnSource, resolveColumn } from "./columns.js";

/**
 * Converts a generic Order clause into Drizzle `orderBy` arguments.
 *
 * @example
 * ```ts
 * db.select().from(users).orderBy(...buildDrizzleOrder(order, users));
 * ```
 */
export function buildDrizzleOrder<TEntity>(order: Order<TEntity> | undefined, columns: ColumnSource): SQL[] {
  if (!order) {
    return [];
  }

  return Object.entries(order).flatMap(([field, direction]) => {
    if (!direction) {
      return [];
    }

    const column = resolveColumn(columns, field);

    return [direction === "desc" ? desc(column) : asc(column)];
  });
}
