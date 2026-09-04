import type { Order, OrderDirection, ScalarKeys } from "../types";

/**
 * Prisma `orderBy` type for an entity, one entry per sorted field to preserve priority.
 */
export type PrismaOrderBy<TEntity> = { [Key in ScalarKeys<TEntity>]?: OrderDirection }[];

/**
 * Converts a generic Order clause into Prisma-compatible format.
 * Returns `undefined` when there is nothing to sort by, so the key can be omitted from the query.
 */
export function buildPrismaOrder<TEntity>(order?: Order<TEntity>): PrismaOrderBy<TEntity> | undefined {
  if (!order) {
    return undefined;
  }

  const output = Object.entries(order).flatMap(([field, direction]) => (direction ? [{ [field]: direction }] : []));

  return output.length > 0 ? (output as PrismaOrderBy<TEntity>) : undefined;
}
