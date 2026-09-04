import { isNestedSelect } from "../shared.js";
import type { QueryFilters, Scalar, Select, Unwrap } from "../types.js";
import { buildPrismaOrder, type PrismaOrderBy } from "./order.js";
import { buildPrismaWhere, type PrismaOptions, type PrismaWhere } from "./where.js";

/**
 * Prisma `select` type for an entity, with nested queries on relations.
 */
export type PrismaSelect<TEntity> = {
  [Key in keyof TEntity]?: Unwrap<TEntity[Key]> extends Scalar ? boolean : boolean | PrismaFilters<Unwrap<TEntity[Key]>>;
};

/**
 * Arguments accepted by Prisma's `findMany`, `findFirst` and nested relation queries.
 */
export type PrismaFilters<TEntity> = {
  where?: PrismaWhere<TEntity>;
  select?: PrismaSelect<TEntity>;
  orderBy?: PrismaOrderBy<TEntity>;
  take?: number;
  skip?: number;
};

/**
 * Converts a generic Select clause into Prisma-compatible format.
 * Returns `undefined` when no field is selected, so the key can be omitted from the query.
 */
export function buildPrismaSelect<TEntity>(select?: Select<TEntity>, options: PrismaOptions = {}): PrismaSelect<TEntity> | undefined {
  if (!select) {
    return undefined;
  }

  const output: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(select)) {
    if (!value) {
      continue;
    }

    if (isNestedSelect(value)) {
      const nested = buildPrismaFilters(value, options);
      output[field] = Object.keys(nested).length > 0 ? nested : true;
      continue;
    }

    output[field] = true;
  }

  return Object.keys(output).length > 0 ? (output as PrismaSelect<TEntity>) : undefined;
}

/**
 * Converts QueryFilters to Prisma query arguments.
 * Empty clauses are omitted, since Prisma rejects an empty `select`.
 *
 * @example
 * ```ts
 * const filters: QueryFilters<User> = {
 *   where: { name: { Contains: "john" } },
 *   order: { createdAt: "desc" },
 *   limit: 10,
 * };
 * const users = await prisma.user.findMany(buildPrismaFilters(filters));
 * ```
 */
export function buildPrismaFilters<TEntity>(filters: QueryFilters<TEntity>, options: PrismaOptions = {}): PrismaFilters<TEntity> {
  const output: PrismaFilters<TEntity> = {};

  const where = buildPrismaWhere(filters.where, options);
  if (Object.keys(where).length > 0) {
    output.where = where;
  }

  const select = buildPrismaSelect(filters.select, options);
  if (select) {
    output.select = select;
  }

  const orderBy = buildPrismaOrder(filters.order);
  if (orderBy) {
    output.orderBy = orderBy;
  }

  if (filters.limit !== undefined) {
    output.take = filters.limit;
  }

  if (filters.offset !== undefined) {
    output.skip = filters.offset;
  }

  return output;
}
