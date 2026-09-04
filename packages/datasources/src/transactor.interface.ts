/**
 * Runs a callback inside a transaction, committing on success and rolling back on error.
 */
export default interface ITransactor<TTransaction> {
  transact<TResult>(callback: (transaction: TTransaction) => Promise<TResult>): Promise<TResult>;
}
