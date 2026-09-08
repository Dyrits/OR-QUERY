import type { QueryFilters, ScalarSelect } from "@ormx/filters";
import { buildTypeOrmFilters, buildTypeOrmWhere } from "@ormx/filters/typeorm";
import type { DataSource, DeepPartial, EntityManager, EntityTarget, FindManyOptions, ObjectLiteral, QueryDeepPartialEntity, Repository } from "typeorm";
import type IDatasource from "./datasource.interface.js";
import type { WriteFilters } from "./datasource.interface.js";
import { assertFiltered, first } from "./guards.js";

/** A TypeORM data source or transaction-scoped entity manager. */
export type TypeOrmContext = DataSource | EntityManager;

function returning<TEntity>(select?: ScalarSelect<TEntity>): "*" | string[] {
  if (!select) {
    return "*";
  }

  const columns = Object.entries(select).flatMap(([field, selected]) => (selected ? [field] : []));
  return columns.length > 0 ? columns : "*";
}

/** Datasource backed by a TypeORM entity repository. */
export default class TypeOrmDatasource<TEntity extends ObjectLiteral, TSelect = TEntity, TInsert extends object = DeepPartial<TEntity>>
  implements IDatasource<TSelect, TInsert, EntityManager>
{
  constructor(
    private readonly context: TypeOrmContext,
    private readonly target: EntityTarget<TEntity>,
  ) {}

  private get repository(): Repository<TEntity> {
    return this.context.getRepository(this.target);
  }

  withTransaction(transaction: EntityManager): TypeOrmDatasource<TEntity, TSelect, TInsert> {
    return new TypeOrmDatasource<TEntity, TSelect, TInsert>(transaction, this.target);
  }

  async store(payload: TInsert): Promise<TSelect> {
    const entity = this.repository.create(payload as unknown as DeepPartial<TEntity>);
    return (await this.repository.save(entity)) as unknown as TSelect;
  }

  async lookup(filters: QueryFilters<TSelect> = {}): Promise<TSelect | null> {
    return first(await this.list({ ...filters, limit: 1 }));
  }

  async list(filters: QueryFilters<TSelect> = {}): Promise<TSelect[]> {
    const options = buildTypeOrmFilters(filters, this.repository.metadata) as FindManyOptions<TEntity>;
    return (await this.repository.find(options)) as unknown as TSelect[];
  }

  async modify(filters: WriteFilters<TSelect>, payload: Partial<TInsert>): Promise<TSelect[]> {
    const where = buildTypeOrmWhere(filters.where);
    assertFiltered(where, "modify");

    const result = await this.repository.update(where as never, payload as QueryDeepPartialEntity<TEntity>, { returning: returning(filters.select) });
    const rows = Array.isArray(result.raw) ? result.raw : [];

    return rows.map((row) => this.hydrate(row as ObjectLiteral)) as unknown as TSelect[];
  }

  async destroy(filters: WriteFilters<TSelect>): Promise<void> {
    const where = buildTypeOrmWhere(filters.where);
    assertFiltered(where, "destroy");

    await this.repository.delete(where as never);
  }

  /** Maps PostgreSQL RETURNING column names back through TypeORM metadata. */
  private hydrate(row: ObjectLiteral): TEntity {
    const repository = this.repository;
    const entity = repository.create();

    for (const column of repository.metadata.columns) {
      if (!Object.hasOwn(row, column.databaseName)) {
        continue;
      }

      const value = repository.manager.connection.driver.prepareHydratedValue(row[column.databaseName], column);
      column.setEntityValue(entity, value);
    }

    return entity;
  }
}
