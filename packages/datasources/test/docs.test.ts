import { PGlite } from "@electric-sql/pglite";
import { buildDrizzleFilters, buildPrismaWhere, buildSupabaseSelect, type QueryFilters } from "@ormx/filters";
import { getTableColumns } from "drizzle-orm";
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import { DrizzleDatasource } from "../src/drizzle.js";
import type { PrismaDatasource } from "../src/prisma.js";
import { SupabaseDatasource } from "../src/supabase.js";
import type { PrismaClient, User as PrismaUser } from "./prisma/generated/client.js";

const users = pgTable("users", {
  createdAt: timestamp("created_at").notNull().defaultNow(),
  email: text("email"),
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
});

type User = typeof users.$inferSelect;

let client: PGlite;
let database: ReturnType<typeof drizzle>;
let datasource: DrizzleDatasource<typeof users>;

beforeAll(async () => {
  client = new PGlite();
  database = drizzle(client);
  datasource = new DrizzleDatasource(database, users);
  await client.exec(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT now()
    );
  `);
});

afterAll(async () => {
  await client.close();
});

describe("documented examples", () => {
  it("builds the Drizzle query shown in the filters README", async () => {
    await datasource.store({ email: "john@example.com", name: "john doe" });
    await datasource.store({ name: "jane", status: "archived" });

    const filters: QueryFilters<User> = {
      limit: 20,
      order: { createdAt: "desc", name: "asc" },
      select: { id: true, name: true },
      where: { email: { IsNotNull: true }, name: { Contains: "john" } },
    };

    const { limit, orderBy, select, where } = buildDrizzleFilters(filters, users);

    const rows = await database
      .select(select ?? getTableColumns(users))
      .from(users)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit ?? 100);

    expect(rows).toEqual([{ id: 1, name: "john doe" }]);
  });

  it("isolates Prisma text operators exactly as documented", () => {
    expect(buildPrismaWhere<PrismaUser>({ name: { Contains: "OHN", IsNot: "John" } })).toEqual({
      AND: [{ name: { contains: "OHN", mode: "insensitive" } }],
      name: { not: "John" },
    });
  });

  it("builds the Supabase columns string shown in the filters README", () => {
    type WithPosts = { id: number; name: string; posts: { title: string }[] };

    expect(buildSupabaseSelect<WithPosts>({ id: true, name: true, posts: { select: { title: true } } })).toBe("id,name,posts(title)");
  });

  it("targets every row through an explicit condition, as the datasources README shows", async () => {
    await datasource.store({ name: "doomed" });

    await datasource.destroy({ where: { id: { IsNotNull: true } } });

    expect(await datasource.list()).toEqual([]);
  });

  it("accepts the documented Prisma relation-select signature", () => {
    type Post = { id: number; title: string };
    type UserWithPosts = PrismaUser & { posts: Post[] };

    expectTypeOf<PrismaDatasource<PrismaClient, "user", UserWithPosts>>().toBeObject();
    expectTypeOf<PrismaDatasource<PrismaClient, "user", UserWithPosts>["list"]>().returns.resolves.toEqualTypeOf<UserWithPosts[]>();
  });

  it("rejects write filters that no target supports", () => {
    // @ts-expect-error ordering is not applicable to a write
    expect(() => datasource.modify({ order: { name: "asc" }, where: { id: { Is: 1 } } }, { name: "x" })).toBeDefined();
    // @ts-expect-error pagination is not applicable to a write
    expect(() => datasource.modify({ limit: 1, where: { id: { Is: 1 } } }, { name: "x" })).toBeDefined();
    // @ts-expect-error relations cannot be returned from a write
    expect(() => new SupabaseDatasource<{ id: number; posts: { id: number }[] }>({ from: () => ({}) }, "t").destroy({ select: { posts: {} } })).toBeDefined();
  });
});
