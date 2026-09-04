import { PGlite } from "@electric-sql/pglite";
import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { type DrizzleDatabase, DrizzleDatasource, DrizzleTransactor } from "../src";

const users = pgTable("users", {
  age: integer("age").notNull(),
  email: text("email"),
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
});

const schema = { users };

let client: PGlite;
let database: PgliteDatabase<typeof schema>;
let datasource: DrizzleDatasource<typeof users>;

beforeAll(async () => {
  client = new PGlite();
  database = drizzle(client, { schema });
  datasource = new DrizzleDatasource(database, users);
  await client.exec(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      age INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
  `);
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await client.exec("TRUNCATE users RESTART IDENTITY");
});

async function seed() {
  await datasource.store({ age: 30, email: "john@example.com", name: "John" });
  await datasource.store({ age: 25, name: "Jane", status: "inactive" });
  await datasource.store({ age: 40, email: "bob@example.com", name: "Bob" });
}

describe("DrizzleDatasource", () => {
  it("infers row types from the table and accepts a schema-typed database", () => {
    const typed: DrizzleDatabase = database;

    expect(typed).toBe(database);
    expectTypeOf(datasource.store).parameter(0).toEqualTypeOf<typeof users.$inferInsert>();
    expectTypeOf(datasource.list).returns.resolves.toEqualTypeOf<(typeof users.$inferSelect)[]>();
  });

  it("stores a row and returns it with generated values", async () => {
    const user = await datasource.store({ age: 30, name: "John" });

    expect(user).toEqual({ age: 30, email: null, id: 1, name: "John", status: "active" });
  });

  it("looks up a single row or returns null", async () => {
    await seed();

    expect(await datasource.lookup({ where: { name: { Contains: "JANE" } } })).toMatchObject({ name: "Jane" });
    expect(await datasource.lookup({ where: { name: { Is: "nobody" } } })).toBeNull();
    expect(await datasource.lookup({ order: { age: "desc" } })).toMatchObject({ name: "Bob" });
  });

  it("lists rows with where, order, pagination and selection", async () => {
    await seed();

    const adults = await datasource.list({ order: { age: "desc" }, where: { age: { GTE: 30 } } });
    expect(adults.map((user) => user.name)).toEqual(["Bob", "John"]);

    const page = await datasource.list({ limit: 1, offset: 1, order: { id: "asc" } });
    expect(page.map((user) => user.name)).toEqual(["Jane"]);

    const partial = await datasource.list({ order: { id: "asc" }, select: { id: true, name: true } });
    expect(partial).toEqual([
      { id: 1, name: "John" },
      { id: 2, name: "Jane" },
      { id: 3, name: "Bob" },
    ]);

    const either = await datasource.list({ order: { id: "asc" }, where: { OneOf: [{ email: { IsNull: true } }, { age: { GT: 35 } }] } });
    expect(either.map((user) => user.name)).toEqual(["Jane", "Bob"]);
  });

  it("modifies matching rows and returns the first one", async () => {
    await seed();

    expect(await datasource.modify({ where: { name: { Is: "Jane" } } }, { status: "active" })).toMatchObject({ name: "Jane", status: "active" });
    expect(await datasource.modify({ where: { name: { Is: "nobody" } } }, { status: "active" })).toBeNull();
    expect(await datasource.modify({ select: { id: true }, where: { id: { Is: 1 } } }, { age: 31 })).toEqual({ id: 1 });
  });

  it("destroys matching rows", async () => {
    await seed();

    await datasource.destroy({ where: { status: { Is: "inactive" } } });

    expect((await datasource.list()).map((user) => user.name)).toEqual(["John", "Bob"]);
  });

  it("refuses to modify or destroy without a where clause", async () => {
    await expect(datasource.modify({}, { age: 1 })).rejects.toThrow("requires a where clause");
    await expect(datasource.destroy({ where: {} })).rejects.toThrow("requires a where clause");
  });

  it("commits transactions", async () => {
    const transactor = new DrizzleTransactor(database);

    const id = await transactor.transact(async (transaction) => {
      const scoped = datasource.withTransaction(transaction);
      const user = await scoped.store({ age: 20, name: "Tx" });
      await scoped.modify({ where: { id: { Is: user.id } } }, { age: 21 });
      return user.id;
    });

    expect(await datasource.lookup({ where: { id: { Is: id } } })).toMatchObject({ age: 21, name: "Tx" });
  });

  it("rolls back transactions on error", async () => {
    const transactor = new DrizzleTransactor(database);

    await expect(
      transactor.transact(async (transaction) => {
        await datasource.withTransaction(transaction).store({ age: 20, name: "Rollback" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await datasource.list()).toEqual([]);
  });
});
