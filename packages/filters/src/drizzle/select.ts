import { isNestedSelect } from "../shared";
import type { Select } from "../types";
import { type ColumnOf, type ColumnSource, resolveColumn } from "./columns";

/**
 * Columns to pass to Drizzle's `db.select(...)`, typed after the column source.
 */
export type DrizzleSelect<TSource extends ColumnSource = ColumnSource> = Record<string, ColumnOf<TSource>>;

/**
 * Converts a generic Select clause into Drizzle selected fields.
 * Returns `undefined` when no field is selected, meaning all columns.
 * Nested selections on relations are not supported by Drizzle's core query builder and throw.
 */
export function buildDrizzleSelect<TEntity, TSource extends ColumnSource = ColumnSource>(select: Select<TEntity> | undefined, columns: TSource): DrizzleSelect<TSource> | undefined {
  if (!select) {
    return undefined;
  }

  const output: DrizzleSelect<TSource> = {};

  for (const [field, value] of Object.entries(select)) {
    if (!value) {
      continue;
    }

    if (isNestedSelect(value)) {
      throw new Error(`[@ormx/filters] Nested selection on "${field}" is not supported by the Drizzle query builder.`);
    }

    output[field] = resolveColumn(columns, field);
  }

  return Object.keys(output).length > 0 ? output : undefined;
}
