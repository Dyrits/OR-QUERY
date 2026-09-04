import { PGlite } from "@electric-sql/pglite";
import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { type DrizzleDatabase, DrizzleDatasource, DrizzleTransactor } from "../src/index.js";
import { itBehavesLikeADatasource } from "./contract.js";

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

describe("DrizzleDatasource", () => {
  itBehavesLikeADatasource({
    datasource: () => datasource,
    transactor: () => new DrizzleTransactor(database),
  });

  it("infers row types from the table and accepts a schema-typed database", () => {
    const typed: DrizzleDatabase = database;

    expect(typed).toBe(database);
    expectTypeOf(datasource.store).parameter(0).toEqualTypeOf<typeof users.$inferInsert>();
    expectTypeOf(datasource.list).returns.resolves.toEqualTypeOf<(typeof users.$inferSelect)[]>();
  });

  it("rejects filters on unknown columns", async () => {
    await expect(datasource.list({ where: { posts: { IsNull: true } } as never })).rejects.toThrow('Unknown column "posts"');
  });
});
