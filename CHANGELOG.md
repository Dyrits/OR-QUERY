# Changelog

## 0.2.0

Both packages are rewritten. Every clause of `QueryFilters` is now implemented on every target, and the datasources are tested against a real PostgreSQL.

### @ormx/filters

Added:

- `select`, `order`, `limit` and `offset` are implemented for Prisma, Drizzle and Supabase. In 0.1.x the select and order builders were stubs that returned empty values.
- Nested filters on relations in `select`, for Prisma and Supabase.
- LIKE wildcards in text operators are escaped, and values embedded in PostgREST `or()` expressions are quoted.
- Unknown operators throw instead of being dropped silently.
- Drizzle builders accept a table directly as column source, and throw on unknown columns.

Breaking:

- Sub-path exports are now one per target: `@ormx/filters/prisma`, `/drizzle`, `/supabase`. The `where/*`, `order/*` and `select/*` paths are gone. Import the builder you need from its target's path.
- `IsNull` and `IsNotNull` are booleans. They apply unless set to `false`. Passing `null`, as 0.1.x examples did, still enables them.
- `where` and `order` accept scalar fields only. Relations are queried through nested filters in `select`.
- `In` and `NotIn` are typed as arrays.
- Prisma text operators emit `mode: "insensitive"` by default, so they match Drizzle and Supabase. Pass `{ caseInsensitive: false }` on databases other than PostgreSQL and MongoDB. When a field mixes text and exact operators, the text ones move to a separate `AND` entry, because Prisma applies `mode` to the whole field.
- `buildDrizzleFilters` returns `where: SQL | undefined`, `orderBy: SQL[]`, `select` and pagination. It used to return a single `SQL` for `orderBy`.
- `buildPrismaOrder` returns an array, so sort priority is preserved.
- `buildPrismaFilters` omits empty clauses, because Prisma rejects an empty `select`.
- `SupabaseFilterBuilder` is renamed `SupabaseQuery` and reduced to the methods actually used.

### @ormx/datasources

Added:

- `PrismaDatasource` and `PrismaTransactor`, typed from the generated client.
- Sub-path exports `@ormx/datasources/drizzle`, `/prisma` and `/supabase`, so a Prisma-only or Supabase-only project does not need `drizzle-orm` installed.
- `modify` and `destroy` reject filters that build no condition, checked on the built condition rather than the input object.
- `list` honours `select`, `order`, `limit` and `offset` on every target.

Breaking:

- `modify` returns every updated row instead of an arbitrary first one, and returns `[]` when nothing matched.
- `lookup` returns `null` instead of `undefined` typed as a row.
- Writes take `WriteFilters`, which is `where` plus a scalar-only `select`. Ordering, pagination and relation selections on a write are now compile errors.
- `DrizzleDatasource` takes the table as first type argument and infers the row types from it. In 0.1.x it was `DrizzleDatasource<TSelect, TInsert>`.
- `DrizzleDatasource` and `DrizzleTransactor` accept any Drizzle PostgreSQL driver and any schema, not only `PostgresJsDatabase`.
- Supabase errors are always wrapped in `SupabaseDatasourceError`, with the original error as `cause`. In 0.1.x a native `PostgrestError` was rethrown as is.
- `SupabaseClientLike` no longer exposes the query-builder shape.
