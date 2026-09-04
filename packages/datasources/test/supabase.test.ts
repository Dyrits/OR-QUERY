import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { type SupabaseClientLike, SupabaseDatasource, SupabaseDatasourceError } from "../src";

type User = {
  id: number;
  name: string;
  email: string | null;
  age: number;
  status: string;
};

type Call = [method: string, ...args: unknown[]];

/**
 * Records the PostgREST builder chain and resolves with the given response.
 */
function createClient(response: { data?: unknown; error?: unknown } = {}) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  const methods = [
    "select",
    "insert",
    "update",
    "delete",
    "single",
    "eq",
    "neq",
    "gt",
    "gte",
    "lt",
    "lte",
    "in",
    "ilike",
    "is",
    "not",
    "or",
    "order",
    "limit",
    "range",
  ];

  for (const method of methods) {
    builder[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    };
  }

  // biome-ignore lint/suspicious/noThenProperty: the fake builder must be thenable, like PostgREST builders are.
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: response.data ?? null, error: response.error ?? null }).then(resolve);

  const client = {
    calls,
    from(table: string) {
      calls.push(["from", table]);
      return builder;
    },
  };

  return client as unknown as SupabaseClientLike & { calls: Call[] };
}

describe("SupabaseDatasource", () => {
  it("accepts typed and untyped Supabase clients", () => {
    type Database = {
      public: {
        Tables: { users: { Row: User; Insert: Partial<User>; Update: Partial<User>; Relationships: [] } };
        Views: Record<string, never>;
        Functions: Record<string, never>;
        Enums: Record<string, never>;
        CompositeTypes: Record<string, never>;
      };
    };

    const untyped: SupabaseClientLike = {} as SupabaseClient;
    const typed: SupabaseClientLike = {} as SupabaseClient<Database>;

    expect([untyped, typed]).toHaveLength(2);
  });

  it("stores a row", async () => {
    const client = createClient({ data: { id: 1, name: "John" } });
    const datasource = new SupabaseDatasource<User>(client, "users");

    expect(await datasource.store({ name: "John" })).toEqual({ id: 1, name: "John" });
    expect(client.calls).toEqual([["from", "users"], ["insert", { name: "John" }], ["select"], ["single"]]);
  });

  it("lists rows with where, order, pagination and selection", async () => {
    const client = createClient({ data: [{ id: 1 }] });
    const datasource = new SupabaseDatasource<User>(client, "users");

    const rows = await datasource.list({ limit: 10, offset: 20, order: { age: "desc" }, select: { id: true, name: true }, where: { age: { GTE: 18 } } });

    expect(rows).toEqual([{ id: 1 }]);
    expect(client.calls).toEqual([
      ["from", "users"],
      ["select", "id,name"],
      ["gte", "age", "18"],
      ["order", "age", { ascending: false }],
      ["range", 20, 29, undefined],
    ]);
  });

  it("looks up a single row or returns null", async () => {
    const found = createClient({ data: [{ id: 1 }] });
    expect(await new SupabaseDatasource<User>(found, "users").lookup({ where: { id: { Is: 1 } } })).toEqual({ id: 1 });
    expect(found.calls).toEqual([
      ["from", "users"],
      ["select", undefined],
      ["eq", "id", "1"],
      ["limit", 1, undefined],
    ]);

    const missing = createClient({ data: [] });
    expect(await new SupabaseDatasource<User>(missing, "users").lookup()).toBeNull();
  });

  it("modifies matching rows and returns the first one", async () => {
    const client = createClient({ data: [{ id: 1, status: "active" }] });
    const datasource = new SupabaseDatasource<User>(client, "users");

    expect(await datasource.modify({ where: { id: { Is: 1 } } }, { status: "active" })).toEqual({ id: 1, status: "active" });
    expect(client.calls).toEqual([
      ["from", "users"],
      ["update", { status: "active" }],
      ["eq", "id", "1"],
      ["select", undefined],
    ]);
  });

  it("destroys matching rows", async () => {
    const client = createClient();
    const datasource = new SupabaseDatasource<User>(client, "users");

    await datasource.destroy({ where: { status: { In: ["banned", "deleted"] } } });

    expect(client.calls).toEqual([["from", "users"], ["delete"], ["in", "status", ["banned", "deleted"]]]);
  });

  it("refuses to modify or destroy without a where clause", async () => {
    const datasource = new SupabaseDatasource<User>(createClient(), "users");

    await expect(datasource.modify({}, { age: 1 })).rejects.toThrow("requires a where clause");
    await expect(datasource.destroy({ where: {} })).rejects.toThrow("requires a where clause");
  });

  it("throws PostgREST errors", async () => {
    const client = createClient({ error: { code: "42P01", message: 'relation "users" does not exist' } });
    const datasource = new SupabaseDatasource<User>(client, "users");

    await expect(datasource.list()).rejects.toThrow(SupabaseDatasourceError);
    await expect(datasource.list()).rejects.toThrow('relation "users" does not exist');
  });

  it("does not support transactions", () => {
    const datasource = new SupabaseDatasource<User>(createClient(), "users");

    expect(() => datasource.withTransaction()).toThrow("does not support transactions");
  });
});
