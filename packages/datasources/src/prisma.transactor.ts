import type ITransactor from "./transactor.interface";

/**
 * Structural subset of a Prisma client used by the transactor.
 */
export interface PrismaClientLike {
  $transaction<TResult>(callback: (transaction: unknown) => Promise<TResult>): Promise<TResult>;
}

/**
 * The transaction-scoped client handed to `$transaction` callbacks.
 */
export type PrismaTransactionClient<TClient> = Omit<TClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

export default class PrismaTransactor<TClient extends PrismaClientLike> implements ITransactor<PrismaTransactionClient<TClient>> {
  constructor(private readonly client: TClient) {}

  transact<TResult>(callback: (transaction: PrismaTransactionClient<TClient>) => Promise<TResult>): Promise<TResult> {
    return this.client.$transaction((transaction) => callback(transaction as PrismaTransactionClient<TClient>));
  }
}
