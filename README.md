# ORMX

A monorepo for unified ORM utilities. Write your queries once with a common filter format, then run them on Prisma, Drizzle, TypeORM or Supabase.

## Packages

| Package | Version | Description | Docs |
|---------|---------|-------------|------|
| [@ormx/filters](./packages/filters) | 0.3.0 | Unified where, select, order and pagination across Prisma, Drizzle, TypeORM and Supabase | [README](./packages/filters/README.md) |
| [@ormx/datasources](./packages/datasources) | 0.3.0 | Unified CRUD datasource with transactions for Drizzle, Prisma, TypeORM and Supabase | [README](./packages/datasources/README.md) |

Both packages target PostgreSQL, and both expose a sub-path per ORM so you only load the one you use.

## Development

```bash
bun install
bun run build      # builds every package
bun run test       # builds filters, then runs both suites (Drizzle, Prisma and TypeORM run against embedded PGlite databases)
bun run typecheck  # type-checks sources and tests
bun run check      # lints and formats with Biome
```

`@ormx/datasources` resolves `@ormx/filters` through its published entry points, so the filters package has to be built before its tests and type-check run. The root `test` and `typecheck` scripts do that first.

## Releasing

Publish with `bun publish` from each package directory, or with npm. The version of `@ormx/filters` that `@ormx/datasources` depends on is a plain semver range, so both tools produce an installable tarball.

## License

MIT
