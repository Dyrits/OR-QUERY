import type { PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type { DrizzleDatabase } from "./drizzle.datasource";
import type ITransactor from "./transactor.interface";

/**
 * Any Drizzle PostgreSQL transaction, whatever its driver and schema.
 */
// biome-ignore lint/suspicious/noExplicitAny: the schema type parameters must stay open to accept any transaction.
export type DrizzleTransaction = PgTransaction<PgQueryResultHKT, any, any>;

export default class DrizzleTransactor implements ITransactor<DrizzleTransaction> {
  constructor(private readonly database: DrizzleDatabase) {}

  transact<TResult>(callback: (transaction: DrizzleTransaction) => Promise<TResult>): Promise<TResult> {
    return this.database.transaction((transaction) => callback(transaction));
  }
}
