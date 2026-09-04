import type { QueryFilters } from "@ormx/filters";
import { buildDrizzleOrder, buildDrizzleSelect, buildDrizzleWhere } from "@ormx/filters/drizzle";
import { type AnyColumn, getTableColumns } from "drizzle-orm";
import type { PgDatabase, PgInsertValue, PgQueryResultHKT, PgTable, PgUpdateSetSource, SelectedFields } from "drizzle-orm/pg-core";
import type IDatasource from "./datasource.interface.js";
import type { WriteFilters } from "./datasource.interface.js";
import { assertFiltered, first } from "./guards.js";

/**
 * Any Drizzle PostgreSQL database or transaction, whatever its driver and schema.
 */
// biome-ignore lint/suspicious/noExplicitAny: the schema type parameters must stay open to accept any database or transaction.
export type DrizzleDatabase = PgDatabase<PgQueryResultHKT, any, any>;

/**
 * Datasource backed by a Drizzle table.
 * Row types are inferred from the table, so `new DrizzleDatasource(db, users)` is fully typed.
 */
export default class DrizzleDatasource<TTable extends PgTable, TSelect = TTable["$inferSelect"], TInsert extends object = TTable["$inferInsert"]>
  implements IDatasource<TSelect, TInsert, DrizzleDatabase>
{
  private readonly columns: Record<string, AnyColumn>;

  constructor(
    private readonly database: DrizzleDatabase,
    private readonly table: TTable,
  ) {
    this.columns = getTableColumns(table) as Record<string, AnyColumn>;
  }

  withTransaction(transaction: DrizzleDatabase): DrizzleDatasource<TTable, TSelect, TInsert> {
    return new DrizzleDatasource<TTable, TSelect, TInsert>(transaction, this.table);
  }

  async store(payload: TInsert): Promise<TSelect> {
    const [row] = await this.database
      .insert(this.table)
      .values(payload as PgInsertValue<TTable>)
      .returning();

    return row as TSelect;
  }

  async lookup(filters: QueryFilters<TSelect> = {}): Promise<TSelect | null> {
    return first(await this.list({ ...filters, limit: 1 }));
  }

  async list(filters: QueryFilters<TSelect> = {}): Promise<TSelect[]> {
    const where = buildDrizzleWhere(filters.where, this.columns);
    const select = buildDrizzleSelect(filters.select, this.columns);
    const orderBy = buildDrizzleOrder(filters.order, this.columns);

    let query = (select ? this.database.select(select as SelectedFields) : this.database.select()).from(this.table as PgTable).$dynamic();

    if (where) {
      query = query.where(where);
    }
    if (orderBy.length > 0) {
      query = query.orderBy(...orderBy);
    }
    if (filters.limit !== undefined) {
      query = query.limit(filters.limit);
    }
    if (filters.offset !== undefined) {
      query = query.offset(filters.offset);
    }

    return (await query) as TSelect[];
  }

  async modify(filters: WriteFilters<TSelect>, payload: Partial<TInsert>): Promise<TSelect[]> {
    const where = buildDrizzleWhere(filters.where, this.columns);
    assertFiltered(where, "modify");

    const select = buildDrizzleSelect(filters.select, this.columns);
    const query = this.database
      .update(this.table)
      .set(payload as PgUpdateSetSource<TTable>)
      .where(where);

    return (select ? await query.returning(select as SelectedFields) : await query.returning()) as TSelect[];
  }

  async destroy(filters: WriteFilters<TSelect>): Promise<void> {
    const where = buildDrizzleWhere(filters.where, this.columns);
    assertFiltered(where, "destroy");

    await this.database.delete(this.table).where(where);
  }
}
