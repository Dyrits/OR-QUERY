import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { type InferPrismaInsert, type InferPrismaSelect, PrismaDatasource, type PrismaModels, PrismaTransactor } from "../src";
import { PrismaClient, type User } from "./prisma/generated/client";

let client: PGlite;
let prisma: PrismaClient;
let datasource: PrismaDatasource<PrismaClient, "user">;

beforeAll(async () => {
  client = new PGlite();
  prisma = new PrismaClient({ adapter: new PrismaPGlite(client) });
  datasource = new PrismaDatasource(prisma, "user");
  await client.exec(`
    CREATE TABLE "User" (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      age INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE "Post" (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      "authorId" INTEGER NOT NULL REFERENCES "User"(id) ON DELETE CASCADE
    );
  `);
});

afterAll(async () => {
  await prisma.$disconnect();
  await client.close();
});

beforeEach(async () => {
  await client.exec('TRUNCATE "User", "Post" RESTART IDENTITY CASCADE');
});

async function seed() {
  await datasource.store({ age: 30, email: "john@example.com", name: "John" });
  await datasource.store({ age: 25, name: "Jane", status: "inactive" });
  await datasource.store({ age: 40, email: "bob@example.com", name: "Bob" });
}

describe("PrismaDatasource", () => {
  it("infers model names and row types from the generated client", () => {
    expectTypeOf<PrismaModels<PrismaClient>>().toEqualTypeOf<"user" | "post">();
    expectTypeOf<InferPrismaSelect<PrismaClient["user"]>>().toEqualTypeOf<User>();
    expectTypeOf<InferPrismaInsert<PrismaClient["user"]>>().toHaveProperty("name");
    expectTypeOf(datasource.list).returns.resolves.toEqualTypeOf<User[]>();
    // @ts-expect-error "$connect" is not a model
    expect(() => new PrismaDatasource(prisma, "$connect")).toBeDefined();
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

  it("selects relations with nested filters", async () => {
    await seed();
    await prisma.post.createMany({
      data: [
        { authorId: 1, title: "Hello" },
        { authorId: 1, title: "World" },
        { authorId: 2, title: "Other" },
      ],
    });

    type UserWithPosts = User & { posts: { title: string }[] };
    const withPosts = new PrismaDatasource<PrismaClient, "user", UserWithPosts>(prisma, "user");

    const [john] = await withPosts.list({
      select: { id: true, posts: { order: { title: "desc" }, select: { title: true }, where: { title: { StartsWith: "h" } } } },
      where: { id: { Is: 1 } },
    });

    expect(john).toEqual({ id: 1, posts: [{ title: "Hello" }] });
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

    expect((await datasource.list({ order: { id: "asc" } })).map((user) => user.name)).toEqual(["John", "Bob"]);
  });

  it("refuses to modify or destroy without a where clause", async () => {
    await expect(datasource.modify({}, { age: 1 })).rejects.toThrow("requires a where clause");
    await expect(datasource.destroy({ where: {} })).rejects.toThrow("requires a where clause");
  });

  it("commits transactions", async () => {
    const transactor = new PrismaTransactor(prisma);

    const id = await transactor.transact(async (transaction) => {
      const scoped = datasource.withTransaction(transaction);
      const user = await scoped.store({ age: 20, name: "Tx" });
      await scoped.modify({ where: { id: { Is: user.id } } }, { age: 21 });
      return user.id;
    });

    expect(await datasource.lookup({ where: { id: { Is: id } } })).toMatchObject({ age: 21, name: "Tx" });
  });

  it("rolls back transactions on error", async () => {
    const transactor = new PrismaTransactor(prisma);

    await expect(
      transactor.transact(async (transaction) => {
        await datasource.withTransaction(transaction).store({ age: 20, name: "Rollback" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(await datasource.list()).toEqual([]);
  });
});
