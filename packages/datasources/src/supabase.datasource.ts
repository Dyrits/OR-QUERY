import type { QueryFilters } from "@ormx/filters";
import { buildSupabaseFilters, buildSupabaseSelect, buildSupabaseWhere, type SupabaseQuery } from "@ormx/filters/supabase";
import type IDatasource from "./datasource.interface";
import { assertFiltered } from "./guards";

export type SupabaseResponse<TData> = PromiseLike<{ data: TData; error: unknown }>;

/**
 * Structural subset of `PostgrestQueryBuilder` used by the datasource.
 */
export interface SupabaseTable {
  select(columns?: string): SupabaseQuery & SupabaseResponse<unknown[] | null>;
  insert(values: unknown): { select(columns?: string): { single(): SupabaseResponse<unknown> } };
  update(values: unknown): SupabaseQuery & { select(columns?: string): SupabaseResponse<unknown[] | null> };
  delete(): SupabaseQuery & SupabaseResponse<unknown>;
}

/**
 * Structural subset of `SupabaseClient` used by the datasource.
 * The query builder returned by `from` is deliberately left untyped here, because comparing an untyped `SupabaseClient` against `SupabaseTable` exceeds TypeScript's instantiation depth.
 */
export interface SupabaseClientLike {
  from: (table: string) => object;
}

/**
 * Error thrown when a Supabase request fails. The original PostgREST error is available as `cause`.
 */
export class SupabaseDatasourceError extends Error {
  constructor(cause: unknown) {
    const message = typeof cause === "object" && cause !== null && "message" in cause ? String(cause.message) : "Supabase request failed.";
    super(`[@ormx/datasources] ${message}`, { cause });
    this.name = "SupabaseDatasourceError";
  }
}

/**
 * Datasource backed by a Supabase table.
 * Supabase has no client-side transactions, so `withTransaction` always throws.
 */
export default class SupabaseDatasource<TSelect, TInsert extends object = Partial<TSelect>> implements IDatasource<TSelect, TInsert, never> {
  constructor(
    private readonly client: SupabaseClientLike,
    private readonly table: string,
  ) {}

  withTransaction(): never {
    throw new Error(
      "[@ormx/datasources] Supabase does not support transactions. Use DrizzleDatasource or PrismaDatasource on your Supabase Postgres connection string instead.",
    );
  }

  private builder(): SupabaseTable {
    return this.client.from(this.table) as SupabaseTable;
  }

  private unwrap<TData>(response: { data: TData; error: unknown }): TData {
    if (response.error) {
      throw response.error instanceof Error ? response.error : new SupabaseDatasourceError(response.error);
    }

    return response.data;
  }

  async store(payload: TInsert): Promise<TSelect> {
    const response = await this.builder().insert(payload).select().single();

    return this.unwrap(response) as TSelect;
  }

  async lookup(filters: QueryFilters<TSelect> = {}): Promise<TSelect | null> {
    const [row] = await this.list({ ...filters, limit: 1 });

    return row ?? null;
  }

  async list(filters: QueryFilters<TSelect> = {}): Promise<TSelect[]> {
    const query = this.builder().select(buildSupabaseSelect(filters.select));
    const response = await buildSupabaseFilters(query, filters);

    return (this.unwrap(response) ?? []) as TSelect[];
  }

  async modify(filters: QueryFilters<TSelect>, payload: Partial<TInsert>): Promise<TSelect | null> {
    assertFiltered(filters, "modify");

    const query = buildSupabaseWhere(this.builder().update(payload), filters.where);
    const response = await query.select(buildSupabaseSelect(filters.select));
    const rows = (this.unwrap(response) ?? []) as TSelect[];

    return rows[0] ?? null;
  }

  async destroy(filters: QueryFilters<TSelect>): Promise<void> {
    assertFiltered(filters, "destroy");

    const response = await buildSupabaseWhere(this.builder().delete(), filters.where);

    this.unwrap(response);
  }
}
