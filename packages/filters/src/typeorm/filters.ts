import type { EntityMetadata, FindManyOptions } from "typeorm";
import type { QueryFilters } from "../types.js";
import { buildTypeOrmOrder } from "./order.js";
import { buildTypeOrmRelations, buildTypeOrmSelect } from "./select.js";
import { buildTypeOrmWhere } from "./where.js";

/** Converts QueryFilters into TypeORM find options. */
export function buildTypeOrmFilters<TEntity>(filters: QueryFilters<TEntity>, metadata?: EntityMetadata): FindManyOptions<TEntity> {
  const output: FindManyOptions<TEntity> = {};
  const where = buildTypeOrmWhere(filters.where);

  if (Object.keys(where).length > 0) {
    output.where = where;
  }

  const select = buildTypeOrmSelect(filters.select);
  if (select) {
    output.select = select;
  }

  if (metadata) {
    const relations = buildTypeOrmRelations(filters.select, metadata);
    if (relations) {
      output.relations = relations;
    }
  }

  const order = buildTypeOrmOrder(filters.order);
  if (order) {
    output.order = order;
  }

  if (filters.limit !== undefined) {
    output.take = filters.limit;
  }

  if (filters.offset !== undefined) {
    output.skip = filters.offset;
  }

  return output;
}
