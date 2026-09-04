import { expect, it } from "vitest";
import type IDatasource from "../src/datasource.interface.js";
import type ITransactor from "../src/transactor.interface.js";

type User = {
  id: number;
  name: string;
  email: string | null;
  age: number;
  status: string;
};

type Datasource = IDatasource<User, { name: string; email?: string | null; age: number; status?: string }, never>;

export type Contract = {
  /** The datasource under test, bound to a users table with the columns of `User`. */
  datasource: () => Datasource;
  /** Transaction runner for the same database. */
  transactor: () => ITransactor<unknown>;
};

/**
 * Behaviour every datasource must share, run once per target so the three implementations cannot drift.
 */
export function itBehavesLikeADatasource({ datasource, transactor }: Contract): void {
  const seed = async () => {
    const source = datasource();
    await source.store({ age: 30, email: "john@example.com", name: "John" });
    await source.store({ age: 25, name: "Jane", status: "inactive" });
    await source.store({ age: 40, email: "bob@example.com", name: "Bob" });
  };

  const names = (rows: User[]) => rows.map((row) => row.name);

  it("stores a row and returns it with generated values", async () => {
    expect(await datasource().store({ age: 30, name: "John" })).toEqual({ age: 30, email: null, id: 1, name: "John", status: "active" });
  });

  it("looks up a single row or returns null", async () => {
    await seed();

    expect(await datasource().lookup({ where: { name: { Contains: "JANE" } } })).toMatchObject({ name: "Jane" });
    expect(await datasource().lookup({ where: { name: { Is: "nobody" } } })).toBeNull();
    expect(await datasource().lookup({ order: { age: "desc" } })).toMatchObject({ name: "Bob" });
  });

  it("lists rows filtered, ordered, paginated and projected", async () => {
    await seed();

    expect(names(await datasource().list({ order: { age: "desc" }, where: { age: { GTE: 30 } } }))).toEqual(["Bob", "John"]);
    expect(names(await datasource().list({ limit: 1, offset: 1, order: { id: "asc" } }))).toEqual(["Jane"]);
    expect(await datasource().list({ order: { id: "asc" }, select: { id: true, name: true } })).toEqual([
      { id: 1, name: "John" },
      { id: 2, name: "Jane" },
      { id: 3, name: "Bob" },
    ]);
  });

  it("combines OneOf groups with OR", async () => {
    await seed();

    const rows = await datasource().list({ order: { id: "asc" }, where: { OneOf: [{ email: { IsNull: true } }, { age: { GT: 35 } }] } });

    expect(names(rows)).toEqual(["Jane", "Bob"]);
  });

  it("matches text operators case-insensitively and treats wildcards literally", async () => {
    const source = datasource();
    await source.store({ age: 1, name: "50% off" });
    await source.store({ age: 2, name: "500 off" });

    expect(names(await source.list({ where: { name: { Contains: "50%" } } }))).toEqual(["50% off"]);
    expect(names(await source.list({ where: { name: { StartsWith: "50% OFF" } } }))).toEqual(["50% off"]);
  });

  it("modifies every matching row and returns them", async () => {
    await seed();

    expect(await datasource().modify({ where: { name: { Is: "Jane" } } }, { status: "active" })).toMatchObject([{ name: "Jane", status: "active" }]);
    expect(await datasource().modify({ where: { name: { Is: "nobody" } } }, { status: "active" })).toEqual([]);
    expect(await datasource().modify({ select: { id: true }, where: { id: { Is: 1 } } }, { age: 31 })).toEqual([{ id: 1 }]);
  });

  it("destroys every matching row", async () => {
    await seed();

    await datasource().destroy({ where: { status: { Is: "inactive" } } });

    expect(names(await datasource().list({ order: { id: "asc" } }))).toEqual(["John", "Bob"]);
  });

  it("refuses a write whose filters build no condition", async () => {
    await seed();

    const blanks = [
      {},
      { where: {} },
      { where: { name: undefined } },
      { where: { id: { Is: undefined } } },
      { where: { email: { IsNull: false } } },
      { where: { OneOf: [] } },
    ];

    for (const filters of blanks) {
      await expect(datasource().modify(filters, { status: "wiped" })).rejects.toThrow("at least one condition");
      await expect(datasource().destroy(filters)).rejects.toThrow("at least one condition");
    }

    expect(await datasource().list()).toHaveLength(3);
  });

  it("commits transactions", async () => {
    const [id, source] = await transactor().transact(async (transaction) => {
      const scoped = datasource().withTransaction(transaction as never);
      const user = await scoped.store({ age: 20, name: "Tx" });
      await scoped.modify({ where: { id: { Is: user.id } } }, { age: 21 });
      return [user.id, scoped] as const;
    });

    expect(source).toBeDefined();
    expect(await datasource().lookup({ where: { id: { Is: id } } })).toMatchObject({ age: 21, name: "Tx" });
  });

  it("rolls back transactions on error", async () => {
    await expect(
      transactor().transact(async (transaction) => {
        await datasource()
          .withTransaction(transaction as never)
          .store({ age: 20, name: "Rollback" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await datasource().list()).toEqual([]);
  });
}
