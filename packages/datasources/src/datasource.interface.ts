import type { QueryFilters, ScalarSelect, Where } from "@ormx/filters";

/**
 * Filters accepted by write operations.
 * Ordering and pagination are not applicable, and only scalar fields can be returned, because no target returns relations from a write.
 */
export type WriteFilters<TSelect> = {
  where?: Where<TSelect>;
  select?: ScalarSelect<TSelect>;
};

/**
 * Common CRUD contract over a single table or model.
 * `TTransaction` is the transaction-scoped client accepted by `withTransaction`.
 */
export default interface IDatasource<TSelect, TInsert extends object, TTransaction> {
  /** Inserts one row and returns it. */
  store(payload: TInsert): Promise<TSelect>;
  /** Returns the first row matching the filters, or `null`. */
  lookup(filters?: QueryFilters<TSelect>): Promise<TSelect | null>;
  /** Returns every row matching the filters. */
  list(filters?: QueryFilters<TSelect>): Promise<TSelect[]>;
  /** Updates every row matching the filters and returns them. Requires a filter that matches at least one condition. */
  modify(filters: WriteFilters<TSelect>, payload: Partial<TInsert>): Promise<TSelect[]>;
  /** Deletes every row matching the filters. Requires a filter that matches at least one condition. */
  destroy(filters: WriteFilters<TSelect>): Promise<void>;
  /** Returns a copy of the datasource bound to a transaction. */
  withTransaction(transaction: TTransaction): IDatasource<TSelect, TInsert, TTransaction>;
}
