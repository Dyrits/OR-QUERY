import type { DataSource, EntityManager } from "typeorm";
import type ITransactor from "./transactor.interface.js";

/** Runs callbacks using TypeORM's transaction-scoped EntityManager. */
export default class TypeOrmTransactor implements ITransactor<EntityManager> {
  constructor(private readonly context: DataSource | EntityManager) {}

  transact<TResult>(callback: (transaction: EntityManager) => Promise<TResult>): Promise<TResult> {
    return this.context.transaction(callback);
  }
}
