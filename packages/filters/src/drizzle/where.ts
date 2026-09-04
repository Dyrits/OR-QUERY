import { type AnyColumn, and, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, notInArray, or, type SQL } from "drizzle-orm";
import { escapeLike, isBlank, isEnabled, operatorEntries, splitWhere } from "../shared";
import type { Operator, Where } from "../types";
import { type ColumnSource, resolveColumn } from "./columns";

type Builder = (column: AnyColumn, value: unknown) => SQL | undefined;

const withValue =
  (build: (column: AnyColumn, value: unknown) => SQL): Builder =>
  (column, value) =>
    isBlank(value) ? undefined : build(column, value);

const withList =
  (build: (column: AnyColumn, values: unknown[]) => SQL): Builder =>
  (column, value) =>
    Array.isArray(value) ? build(column, value) : undefined;

const withFlag =
  (build: (column: AnyColumn) => SQL): Builder =>
  (column, value) =>
    isEnabled(value) ? build(column) : undefined;

const withPattern = (pattern: (value: string) => string): Builder => withValue((column, value) => ilike(column, pattern(escapeLike(String(value)))));

const operators: Record<Operator, Builder> = {
  Contains: withPattern((value) => `%${value}%`),
  EndsWith: withPattern((value) => `%${value}`),
  GT: withValue(gt),
  GTE: withValue(gte),
  In: withList(inArray),
  Is: withValue(eq),
  IsNot: withValue(ne),
  IsNotNull: withFlag(isNotNull),
  IsNull: withFlag(isNull),
  LT: withValue(lt),
  LTE: withValue(lte),
  NotIn: withList(notInArray),
  StartsWith: withPattern((value) => `${value}%`),
};

/**
 * Converts a generic Where clause into a Drizzle SQL condition.
 * Returns `undefined` when there is no condition, which Drizzle's `.where()` accepts as "no filter".
 */
export function buildDrizzleWhere<TEntity>(where: Where<TEntity> | undefined, columns: ColumnSource): SQL | undefined {
  const conditions: SQL[] = [];
  const { fields, groups } = splitWhere(where);

  for (const [field, condition] of fields) {
    const column = resolveColumn(columns, field);

    for (const [operator, value] of operatorEntries(condition)) {
      const built = operators[operator](column, value);
      if (built) {
        conditions.push(built);
      }
    }
  }

  const alternatives = groups.map((group) => buildDrizzleWhere(group, columns)).filter((condition): condition is SQL => condition !== undefined);
  if (alternatives.length > 0) {
    conditions.push(or(...alternatives) as SQL);
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return conditions.length === 1 ? conditions[0] : (and(...conditions) as SQL);
}
