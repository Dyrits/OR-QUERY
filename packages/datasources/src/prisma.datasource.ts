import type { QueryFilters } from "@ormx/filters";
import { buildPrismaFilters, type PrismaOptions } from "@ormx/filters/prisma";
import type IDatasource from "./datasource.interface";
import { assertFiltered } from "./guards";

/**
 * Structural subset of a Prisma model delegate used by the datasource.
 * Every model of a generated Prisma client satisfies it. `updateManyAndReturn` requires Prisma 6.2 or later.
 */
export interface PrismaDelegate {
  create(args: { data: unknown }): Promise<unknown>;
  findMany(args: unknown): Promise<unknown[]>;
  updateManyAndReturn(args: unknown): Promise<unknown[]>;
  deleteMany(args: unknown): Promise<unknown>;
}

/**
 * Names of the models exposed by a Prisma client.
 */
export type PrismaModels<TClient> = { [Key in keyof TClient]: TClient[Key] extends PrismaDelegate ? Key : never }[keyof TClient];

/**
 * Row type returned by a Prisma model delegate.
 */
export type InferPrismaSelect<TDelegate> = TDelegate extends { findMany(...args: never[]): Promise<(infer TRow)[]> } ? TRow : never;

/**
 * Create input accepted by a Prisma model delegate.
 */
export type InferPrismaInsert<TDelegate> = TDelegate extends { create(args: { data: infer TData extends object }): unknown } ? TData : never;

/**
 * Datasource backed by a Prisma model.
 * Row types are inferred from the client, so `new PrismaDatasource(prisma, "user")` is fully typed.
 */
export default class PrismaDatasource<
  TClient extends object,
  TModel extends PrismaModels<TClient>,
  TSelect = InferPrismaSelect<TClient[TModel]>,
  TInsert extends object = InferPrismaInsert<TClient[TModel]>,
> implements IDatasource<TSelect, TInsert, Pick<TClient, TModel>>
{
  constructor(
    private readonly client: TClient,
    private readonly model: TModel,
    private readonly options: PrismaOptions = {},
  ) {}

  private get delegate(): PrismaDelegate {
    const delegate = (this.client as Record<PropertyKey, unknown>)[this.model];

    if (!delegate) {
      throw new Error(`[@ormx/datasources] Unknown Prisma model "${String(this.model)}".`);
    }

    return delegate as PrismaDelegate;
  }

  withTransaction(transaction: Pick<TClient, TModel>): PrismaDatasource<TClient, TModel, TSelect, TInsert> {
    return new PrismaDatasource<TClient, TModel, TSelect, TInsert>(transaction as TClient, this.model, this.options);
  }

  async store(payload: TInsert): Promise<TSelect> {
    return (await this.delegate.create({ data: payload })) as TSelect;
  }

  async lookup(filters: QueryFilters<TSelect> = {}): Promise<TSelect | null> {
    const [row] = await this.list({ ...filters, limit: 1 });

    return row ?? null;
  }

  async list(filters: QueryFilters<TSelect> = {}): Promise<TSelect[]> {
    return (await this.delegate.findMany(buildPrismaFilters(filters, this.options))) as TSelect[];
  }

  async modify(filters: QueryFilters<TSelect>, payload: Partial<TInsert>): Promise<TSelect | null> {
    assertFiltered(filters, "modify");
    const { select, where } = buildPrismaFilters(filters, this.options);

    const [row] = await this.delegate.updateManyAndReturn({ data: payload, select, where });

    return (row as TSelect | undefined) ?? null;
  }

  async destroy(filters: QueryFilters<TSelect>): Promise<void> {
    assertFiltered(filters, "destroy");
    const { where } = buildPrismaFilters(filters, this.options);

    await this.delegate.deleteMany({ where });
  }
}
