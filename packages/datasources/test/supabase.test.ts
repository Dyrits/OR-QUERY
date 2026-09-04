import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { type SupabaseClientLike, SupabaseDatasource, SupabaseDatasourceError } from "../src/index.js";

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
  const methods = ["select", "insert", "update", "delete", "single", "filter", "or", "order", "limit", "range"];

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
      ["filter", "age", "gte", "18"],
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
      ["filter", "id", "eq", "1"],
      ["limit", 1, undefined],
    ]);

    const missing = createClient({ data: [] });
    expect(await new SupabaseDatasource<User>(missing, "users").lookup()).toBeNull();
  });

  it("modifies matching rows and returns them", async () => {
    const client = createClient({ data: [{ id: 1, status: "active" }] });
    const datasource = new SupabaseDatasource<User>(client, "users");

    expect(await datasource.modify({ where: { id: { Is: 1 } } }, { status: "active" })).toEqual([{ id: 1, status: "active" }]);
    expect(client.calls).toEqual([
      ["from", "users"],
      ["update", { status: "active" }],
      ["filter", "id", "eq", "1"],
      ["select", undefined],
    ]);
  });

  it("destroys matching rows", async () => {
    const client = createClient();
    const datasource = new SupabaseDatasource<User>(client, "users");

    await datasource.destroy({ where: { status: { In: ["banned", "deleted"] } } });

    expect(client.calls).toEqual([["from", "users"], ["delete"], ["filter", "status", "in", "(banned,deleted)"]]);
  });

  it("refuses a write whose filters build no condition", async () => {
    const client = createClient();
    const datasource = new SupabaseDatasource<User>(client, "users");
    const blanks = [{}, { where: {} }, { where: { name: undefined } }, { where: { id: { Is: undefined } } }, { where: { OneOf: [] } }];

    for (const filters of blanks) {
      await expect(datasource.modify(filters, { status: "wiped" })).rejects.toThrow("at least one condition");
      await expect(datasource.destroy(filters)).rejects.toThrow("at least one condition");
    }

    expect(client.calls).toEqual([]);
  });

  it("wraps PostgREST errors, including native ones", async () => {
    const plain = new SupabaseDatasource<User>(createClient({ error: { code: "42P01", message: 'relation "users" does not exist' } }), "users");
    await expect(plain.list()).rejects.toThrow(SupabaseDatasourceError);
    await expect(plain.list()).rejects.toThrow('relation "users" does not exist');

    const native = new SupabaseDatasource<User>(createClient({ error: new Error("network down") }), "users");
    const error = await native.list().catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(SupabaseDatasourceError);
    expect((error as SupabaseDatasourceError).cause).toBeInstanceOf(Error);
  });

  it("does not support transactions", () => {
    const datasource = new SupabaseDatasource<User>(createClient(), "users");

    expect(() => datasource.withTransaction()).toThrow("does not support transactions");
  });
});
