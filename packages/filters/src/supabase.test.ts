import { describe, expect, it } from "vitest";
import {
  buildSupabaseFilters,
  buildSupabaseOrder,
  buildSupabaseRange,
  buildSupabaseSelect,
  buildSupabaseWhere,
  buildSupabaseWhereString,
  type SupabaseQuery,
} from "./supabase";
import type { QueryFilters } from "./types";

type Post = {
  id: number;
  title: string;
  published: boolean;
};

type User = {
  id: number;
  name: string;
  email: string | null;
  age: number;
  status: string;
  role: string;
  createdAt: Date;
  posts: Post[];
};

type Call = [method: string, ...args: unknown[]];

function createQuery(): SupabaseQuery & { calls: Call[] } {
  const calls: Call[] = [];
  const query = { calls } as SupabaseQuery & { calls: Call[] };
  const methods = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "ilike", "is", "not", "or", "order", "limit", "range"] as const;

  for (const method of methods) {
    (query as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return query;
    };
  }

  return query;
}

function calls<TEntity>(where: QueryFilters<TEntity>["where"], path?: string): Call[] {
  const query = createQuery();
  buildSupabaseWhere(query, where, path);
  return query.calls;
}

describe("buildSupabaseWhere", () => {
  it("leaves the query untouched for undefined or empty input", () => {
    const query = createQuery();

    expect(buildSupabaseWhere<typeof query, User>(query, undefined)).toBe(query);
    expect(calls<User>({})).toEqual([]);
    expect(calls<User>({ name: undefined, status: { Is: undefined } })).toEqual([]);
    expect(calls<User>({ OneOf: [] })).toEqual([]);
  });

  it.each([
    ["Is", { name: { Is: "john" } }, [["eq", "name", "john"]]],
    ["IsNot", { status: { IsNot: "inactive" } }, [["neq", "status", "inactive"]]],
    ["GT", { age: { GT: 18 } }, [["gt", "age", "18"]]],
    ["GTE", { age: { GTE: 21 } }, [["gte", "age", "21"]]],
    ["LT", { age: { LT: 65 } }, [["lt", "age", "65"]]],
    ["LTE", { age: { LTE: 100 } }, [["lte", "age", "100"]]],
    ["In", { status: { In: ["active", "pending"] } }, [["in", "status", ["active", "pending"]]]],
    ["NotIn", { status: { NotIn: ["banned", "deleted"] } }, [["not", "status", "in", "(banned,deleted)"]]],
    ["Contains", { name: { Contains: "john" } }, [["ilike", "name", "%john%"]]],
    ["StartsWith", { email: { StartsWith: "admin" } }, [["ilike", "email", "admin%"]]],
    ["EndsWith", { email: { EndsWith: "@example.com" } }, [["ilike", "email", "%@example.com"]]],
    ["IsNull", { email: { IsNull: true } }, [["is", "email", null]]],
    ["IsNotNull", { email: { IsNotNull: true } }, [["not", "email", "is", null]]],
  ] as const)("maps %s", (_operator, where, expected) => {
    expect(calls<User>(where)).toEqual(expected);
  });

  it("serializes dates as ISO strings", () => {
    const date = new Date("2026-01-02T03:04:05.000Z");

    expect(calls<User>({ createdAt: { GTE: date } })).toEqual([["gte", "createdAt", "2026-01-02T03:04:05.000Z"]]);
  });

  it("escapes LIKE wildcards in text operators", () => {
    expect(calls<User>({ name: { Contains: "50%_off" } })).toEqual([["ilike", "name", "%50\\%\\_off%"]]);
  });

  it("quotes reserved characters inside NotIn lists", () => {
    expect(calls<User>({ name: { NotIn: ["a,b", "(c)"] } })).toEqual([["not", "name", "in", '("a,b","(c)")']]);
  });

  it("ignores IsNull and IsNotNull when set to false", () => {
    expect(calls<User>({ email: { IsNotNull: false, IsNull: false } })).toEqual([]);
  });

  it("keeps falsy values such as 0", () => {
    expect(calls<User>({ age: { Is: 0 } })).toEqual([["eq", "age", "0"]]);
  });

  it("chains operators and fields", () => {
    expect(calls<User>({ age: { GTE: 18, LTE: 65 }, status: { Is: "active" } })).toEqual([
      ["gte", "age", "18"],
      ["lte", "age", "65"],
      ["eq", "status", "active"],
    ]);
  });

  it("maps OneOf to an or() filter string", () => {
    expect(calls<User>({ age: { GTE: 18 }, OneOf: [{ status: { Is: "active" } }, { role: { Is: "admin" } }] })).toEqual([
      ["gte", "age", "18"],
      ["or", "status.eq.active,role.eq.admin", undefined],
    ]);
  });

  it("wraps groups with several conditions in and()", () => {
    expect(calls<User>({ OneOf: [{ name: { Contains: "admin" }, status: { Is: "active" } }, { role: { Is: "superadmin" } }] })).toEqual([
      ["or", "and(name.ilike.%admin%,status.eq.active),role.eq.superadmin", undefined],
    ]);
  });

  it("supports nested OneOf groups and every operator inside or()", () => {
    const where: QueryFilters<User>["where"] = {
      OneOf: [{ email: { IsNull: true }, OneOf: [{ age: { In: [1, 2] } }, { status: { NotIn: ["x"] } }] }, { role: { IsNotNull: true } }],
    };

    expect(buildSupabaseWhereString(where)).toBe("or(and(email.is.null,or(age.in.(1,2),status.not.in.(x))),role.not.is.null)");
  });

  it("qualifies columns with the embedded resource path", () => {
    expect(calls<Post>({ OneOf: [{ title: { Is: "a" } }, { title: { Is: "b" } }], published: { Is: true } }, "posts")).toEqual([
      ["eq", "posts.published", "true"],
      ["or", "title.eq.a,title.eq.b", { referencedTable: "posts" }],
    ]);
  });
});

describe("buildSupabaseOrder", () => {
  it("leaves the query untouched when there is nothing to sort", () => {
    const query = createQuery();

    buildSupabaseOrder<typeof query, User>(query, undefined);
    buildSupabaseOrder<typeof query, User>(query, { name: undefined });

    expect(query.calls).toEqual([]);
  });

  it("orders in priority order, on the table or an embedded resource", () => {
    const query = createQuery();

    buildSupabaseOrder<typeof query, User>(query, { age: "desc", name: "asc" });
    buildSupabaseOrder<typeof query, Post>(query, { title: "asc" }, "posts");

    expect(query.calls).toEqual([
      ["order", "age", { ascending: false }],
      ["order", "name", { ascending: true }],
      ["order", "title", { ascending: true, referencedTable: "posts" }],
    ]);
  });
});

describe("buildSupabaseRange", () => {
  it("uses limit() without offset and range() with offset", () => {
    const query = createQuery();

    buildSupabaseRange(query, undefined, undefined);
    buildSupabaseRange(query, 10);
    buildSupabaseRange(query, 10, 20);
    buildSupabaseRange(query, 5, 0, "posts");

    expect(query.calls).toEqual([
      ["limit", 10, undefined],
      ["range", 20, 29, undefined],
      ["range", 0, 4, { referencedTable: "posts" }],
    ]);
  });

  it("rejects an offset without limit", () => {
    expect(() => buildSupabaseRange(createQuery(), undefined, 20)).toThrow("requires a limit");
  });
});

describe("buildSupabaseSelect", () => {
  it("returns undefined when nothing is selected", () => {
    expect(buildSupabaseSelect<User>(undefined)).toBeUndefined();
    expect(buildSupabaseSelect<User>({ id: false })).toBeUndefined();
  });

  it("builds a PostgREST columns string with embedded resources", () => {
    expect(buildSupabaseSelect<User>({ id: true, name: true, posts: { select: { title: true } } })).toBe("id,name,posts(title)");
    expect(buildSupabaseSelect<User>({ posts: true })).toBe("posts");
    expect(buildSupabaseSelect<User>({ posts: {} })).toBe("posts(*)");
  });
});

describe("buildSupabaseFilters", () => {
  it("applies where, order and pagination on the table and its embedded resources", () => {
    const query = createQuery();
    const filters: QueryFilters<User> = {
      limit: 10,
      offset: 20,
      order: { createdAt: "desc" },
      select: { id: true, posts: { limit: 3, order: { id: "desc" }, select: { title: true }, where: { published: { Is: true } } } },
      where: { age: { GTE: 18 } },
    };

    expect(buildSupabaseFilters(query, filters)).toBe(query);
    expect(query.calls).toEqual([
      ["gte", "age", "18"],
      ["order", "createdAt", { ascending: false }],
      ["range", 20, 29, undefined],
      ["eq", "posts.published", "true"],
      ["order", "id", { ascending: false, referencedTable: "posts" }],
      ["limit", 3, { referencedTable: "posts" }],
    ]);
  });

  it("does nothing for empty filters", () => {
    const query = createQuery();

    buildSupabaseFilters<typeof query, User>(query, {});

    expect(query.calls).toEqual([]);
  });
});
