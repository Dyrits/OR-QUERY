import type { QueryFilters } from "@ormx/filters";
import { buildDrizzleFilters } from "@ormx/filters/drizzle";
import { getTableColumns } from "drizzle-orm";
import type { PgDatabase, PgInsertValue, PgQueryResultHKT, PgTable, PgUpdateSetSource, SelectedFields } from "drizzle-orm/pg-core";
import type IDatasource from "./datasource.interface";
import { assertFiltered } from "./guards";

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
  constructor(
    private readonly database: DrizzleDatabase,
    private readonly table: TTable,
  ) {}

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
    const [row] = await this.list({ ...filters, limit: 1 });

    return row ?? null;
  }

  async list(filters: QueryFilters<TSelect> = {}): Promise<TSelect[]> {
    const { limit, offset, orderBy, select, where } = buildDrizzleFilters(filters, this.table);

    let query = this.database
      .select((select ?? getTableColumns(this.table)) as SelectedFields)
      .from(this.table as PgTable)
      .$dynamic();

    if (where) {
      query = query.where(where);
    }
    if (orderBy.length > 0) {
      query = query.orderBy(...orderBy);
    }
    if (limit !== undefined) {
      query = query.limit(limit);
    }
    if (offset !== undefined) {
      query = query.offset(offset);
    }

    return (await query) as TSelect[];
  }

  async modify(filters: QueryFilters<TSelect>, payload: Partial<TInsert>): Promise<TSelect | null> {
    assertFiltered(filters, "modify");
    const { select, where } = buildDrizzleFilters(filters, this.table);

    const query = this.database
      .update(this.table)
      .set(payload as PgUpdateSetSource<TTable>)
      .where(where);
    const rows: unknown[] = select ? await query.returning(select as SelectedFields) : await query.returning();

    return (rows[0] as TSelect | undefined) ?? null;
  }

  async destroy(filters: QueryFilters<TSelect>): Promise<void> {
    assertFiltered(filters, "destroy");
    const { where } = buildDrizzleFilters(filters, this.table);

    await this.database.delete(this.table).where(where);
  }
}
