import { type AnyColumn, getTableColumns, is, Table } from "drizzle-orm";

/**
 * Function resolving a field name to a Drizzle column.
 */
export type GetColumn = (field: string) => AnyColumn | undefined;

/**
 * Where to look up columns: a Drizzle table, a record of columns, or a resolver function.
 */
export type ColumnSource = Table | Record<string, AnyColumn> | GetColumn;

/**
 * Column type produced by a column source, so that selections built from a `pgTable` are typed as `PgColumn` and accepted by `db.select()`.
 */
export type ColumnOf<TSource extends ColumnSource> = TSource extends Table
  ? TSource["_"]["columns"][keyof TSource["_"]["columns"]]
  : TSource extends Record<string, infer TColumn extends AnyColumn>
    ? TColumn
    : TSource extends (field: string) => infer TColumn
      ? Exclude<TColumn, undefined>
      : AnyColumn;

/**
 * Resolves a field name to a column, throwing when the field is unknown so that typos do not produce broken SQL.
 */
export function resolveColumn<TSource extends ColumnSource>(source: TSource, field: string): ColumnOf<TSource> {
  let column: AnyColumn | undefined;

  if (typeof source === "function") {
    column = source(field);
  } else {
    // Own properties only, so that a field named after a prototype member such as "constructor" is rejected rather than resolved to a function.
    const columns = (is(source, Table) ? getTableColumns(source) : source) as Record<string, AnyColumn>;
    column = Object.hasOwn(columns, field) ? columns[field] : undefined;
  }

  if (!column) {
    throw new Error(`[@ormx/filters] Unknown column "${field}".`);
  }

  return column as ColumnOf<TSource>;
}
