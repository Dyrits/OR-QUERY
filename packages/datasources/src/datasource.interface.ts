import type { QueryFilters } from "@ormx/filters";

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
  /** Updates the rows matching the filters and returns the first one, or `null` when nothing matched. A where clause is required. */
  modify(filters: QueryFilters<TSelect>, payload: Partial<TInsert>): Promise<TSelect | null>;
  /** Deletes the rows matching the filters. A where clause is required. */
  destroy(filters: QueryFilters<TSelect>): Promise<void>;
  /** Returns a copy of the datasource bound to a transaction. */
  withTransaction(transaction: TTransaction): IDatasource<TSelect, TInsert, TTransaction>;
}
