import { getTableColumns, type SQL } from "drizzle-orm";
import { integer, PgDialect, pgTable, QueryBuilder, text, timestamp } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { buildDrizzleFilters, buildDrizzleOrder, buildDrizzleSelect, buildDrizzleWhere } from "./drizzle/index.js";
import type { QueryFilters } from "./types.js";

const users = pgTable("users", {
  age: integer("age"),
  createdAt: timestamp("created_at"),
  email: text("email"),
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role"),
  status: text("status"),
});

type User = typeof users.$inferSelect & { posts: { id: number }[] };

const dialect = new PgDialect();

function render(condition: SQL | undefined) {
  if (!condition) {
    return undefined;
  }
  const { params, sql } = dialect.sqlToQuery(condition);
  return { params, sql };
}

describe("buildDrizzleWhere", () => {
  it("returns undefined when there is no condition", () => {
    expect(buildDrizzleWhere<User>(undefined, users)).toBeUndefined();
    expect(buildDrizzleWhere<User>({}, users)).toBeUndefined();
    expect(buildDrizzleWhere<User>({ name: undefined, status: { Is: undefined } }, users)).toBeUndefined();
    expect(buildDrizzleWhere<User>({ OneOf: [] }, users)).toBeUndefined();
  });

  it.each([
    ["Is", { name: { Is: "john" } }, '"users"."name" = $1', ["john"]],
    ["IsNot", { status: { IsNot: "inactive" } }, '"users"."status" <> $1', ["inactive"]],
    ["GT", { age: { GT: 18 } }, '"users"."age" > $1', [18]],
    ["GTE", { age: { GTE: 21 } }, '"users"."age" >= $1', [21]],
    ["LT", { age: { LT: 65 } }, '"users"."age" < $1', [65]],
    ["LTE", { age: { LTE: 100 } }, '"users"."age" <= $1', [100]],
    ["In", { status: { In: ["active", "pending"] } }, '"users"."status" in ($1, $2)', ["active", "pending"]],
    ["NotIn", { id: { NotIn: [1, 2] } }, '"users"."id" not in ($1, $2)', [1, 2]],
    ["Contains", { name: { Contains: "john" } }, '"users"."name" ilike $1', ["%john%"]],
    ["StartsWith", { email: { StartsWith: "admin" } }, '"users"."email" ilike $1', ["admin%"]],
    ["EndsWith", { email: { EndsWith: "@example.com" } }, '"users"."email" ilike $1', ["%@example.com"]],
    ["IsNull", { email: { IsNull: true } }, '"users"."email" is null', []],
    ["IsNotNull", { email: { IsNotNull: true } }, '"users"."email" is not null', []],
  ] as const)("maps %s", (_operator, where, sql, params) => {
    expect(render(buildDrizzleWhere<User>(where, users))).toEqual({ params, sql });
  });

  it("escapes LIKE wildcards in text operators", () => {
    expect(render(buildDrizzleWhere<User>({ name: { Contains: "50%_off" } }, users))).toEqual({ params: ["%50\\%\\_off%"], sql: '"users"."name" ilike $1' });
  });

  it("applies flag operators unless they are false, so JSON payloads using null keep working", () => {
    expect(render(buildDrizzleWhere<User>({ email: { IsNull: null as unknown as boolean } }, users))).toEqual({
      params: [],
      sql: '"users"."email" is null',
    });
    expect(buildDrizzleWhere<User>({ email: { IsNotNull: false, IsNull: false } }, users)).toBeUndefined();
  });

  it("rejects unknown operators instead of dropping them", () => {
    expect(() => buildDrizzleWhere<User>({ name: { Like: "john" } as never }, users)).toThrow('Unknown operator "Like"');
  });

  it("keeps falsy values such as 0", () => {
    expect(render(buildDrizzleWhere<User>({ age: { Is: 0 } }, users))).toEqual({ params: [0], sql: '"users"."age" = $1' });
  });

  it("combines operators and fields with AND", () => {
    expect(render(buildDrizzleWhere<User>({ age: { GTE: 18, LTE: 65 }, status: { Is: "active" } }, users))).toEqual({
      params: [18, 65, "active"],
      sql: '("users"."age" >= $1 and "users"."age" <= $2 and "users"."status" = $3)',
    });
  });

  it("maps OneOf to OR combined with the other conditions", () => {
    expect(render(buildDrizzleWhere<User>({ age: { GTE: 18 }, OneOf: [{ status: { Is: "active" } }, { role: { Is: "admin" } }] }, users))).toEqual({
      params: [18, "active", "admin"],
      sql: '("users"."age" >= $1 and ("users"."status" = $2 or "users"."role" = $3))',
    });
  });

  it("supports nested OneOf groups", () => {
    const where = { OneOf: [{ name: { Is: "a" }, OneOf: [{ age: { Is: 1 } }, { age: { Is: 2 } }] }, { role: { Is: "admin" } }] };

    expect(render(buildDrizzleWhere<User>(where, users))).toEqual({
      params: ["a", 1, 2, "admin"],
      sql: '(("users"."name" = $1 and ("users"."age" = $2 or "users"."age" = $3)) or "users"."role" = $4)',
    });
  });

  it("accepts a record of columns or a resolver function as column source", () => {
    const columns = getTableColumns(users);

    expect(render(buildDrizzleWhere<User>({ name: { Is: "john" } }, columns))).toEqual({ params: ["john"], sql: '"users"."name" = $1' });
    expect(render(buildDrizzleWhere<User>({ name: { Is: "john" } }, (field) => columns[field as keyof typeof columns]))).toEqual({
      params: ["john"],
      sql: '"users"."name" = $1',
    });
  });

  it("throws on unknown columns, including inherited property names", () => {
    expect(() => buildDrizzleWhere<Record<string, unknown>>({ posts: { IsNull: true } }, users)).toThrow('Unknown column "posts"');
    expect(() => buildDrizzleWhere<Record<string, unknown>>({ constructor: { Is: "x" } }, users)).toThrow('Unknown column "constructor"');
    expect(() => buildDrizzleWhere<Record<string, unknown>>({ toString: { Is: "x" } }, getTableColumns(users))).toThrow('Unknown column "toString"');
  });
});

describe("buildDrizzleOrder", () => {
  it("returns an empty array when there is nothing to sort", () => {
    expect(buildDrizzleOrder<User>(undefined, users)).toEqual([]);
    expect(buildDrizzleOrder<User>({ name: undefined }, users)).toEqual([]);
  });

  it("preserves sort priority", () => {
    const [first, second] = buildDrizzleOrder<User>({ age: "desc", name: "asc" }, users);

    expect(render(first)).toEqual({ params: [], sql: '"users"."age" desc' });
    expect(render(second)).toEqual({ params: [], sql: '"users"."name" asc' });
  });
});

describe("buildDrizzleSelect", () => {
  it("returns undefined when nothing is selected", () => {
    expect(buildDrizzleSelect<User>(undefined, users)).toBeUndefined();
    expect(buildDrizzleSelect<User>({ id: false }, users)).toBeUndefined();
  });

  it("maps selected fields to columns", () => {
    expect(buildDrizzleSelect<User>({ id: true, name: true }, users)).toEqual({ id: users.id, name: users.name });
  });

  it("rejects nested selections", () => {
    expect(() => buildDrizzleSelect<User>({ posts: { select: { id: true } } }, users)).toThrow("Nested selection");
  });
});

describe("buildDrizzleFilters", () => {
  it("builds a complete query", () => {
    const filters: QueryFilters<User> = {
      limit: 10,
      offset: 20,
      order: { createdAt: "desc" },
      select: { id: true, name: true },
      where: { age: { GTE: 18 } },
    };
    const { limit, offset, orderBy, select, where } = buildDrizzleFilters(filters, users);
    const query = new QueryBuilder()
      .select(select ?? getTableColumns(users))
      .from(users)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit as number)
      .offset(offset as number);

    expect(query.toSQL()).toEqual({
      params: [18, 10, 20],
      sql: 'select "id", "name" from "users" where "users"."age" >= $1 order by "users"."created_at" desc limit $2 offset $3',
    });
  });

  it("returns neutral parts for empty filters", () => {
    expect(buildDrizzleFilters<User>({}, users)).toEqual({ limit: undefined, offset: undefined, orderBy: [], select: undefined, where: undefined });
  });
});
