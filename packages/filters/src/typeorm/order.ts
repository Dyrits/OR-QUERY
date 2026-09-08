import type { FindOptionsOrder } from "typeorm";
import type { Order } from "../types.js";

/** Converts a generic Order clause into TypeORM find options. */
export function buildTypeOrmOrder<TEntity>(order?: Order<TEntity>): FindOptionsOrder<TEntity> | undefined {
  if (!order) {
    return undefined;
  }

  const output = Object.fromEntries(Object.entries(order).flatMap(([field, direction]) => (direction ? [[field, direction]] : [])));
  return Object.keys(output).length > 0 ? (output as FindOptionsOrder<TEntity>) : undefined;
}
