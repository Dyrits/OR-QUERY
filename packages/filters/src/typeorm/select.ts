import type { EntityMetadata, FindOptionsRelations, FindOptionsSelect } from "typeorm";
import { isNestedSelect } from "../shared.js";
import type { Select } from "../types.js";

function assertSupportedRelationFilters(field: string, value: Record<string, unknown>): void {
  if (value.where !== undefined || value.order !== undefined || value.limit !== undefined || value.offset !== undefined) {
    throw new Error(`[@ormx/filters] TypeORM does not support filters, ordering or pagination scoped to relation "${field}".`);
  }
}

/** Converts a generic Select clause into TypeORM's nested selection shape. */
export function buildTypeOrmSelect<TEntity>(select?: Select<TEntity>): FindOptionsSelect<TEntity> | undefined {
  if (!select) {
    return undefined;
  }

  const output: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(select)) {
    if (!value) {
      continue;
    }

    if (isNestedSelect(value)) {
      assertSupportedRelationFilters(field, value as Record<string, unknown>);
      output[field] = buildTypeOrmSelect(value.select) ?? true;
    } else {
      output[field] = true;
    }
  }

  return Object.keys(output).length > 0 ? (output as FindOptionsSelect<TEntity>) : undefined;
}

/**
 * Resolves selected relations through TypeORM metadata. This is separate from
 * `select` because a boolean selection can name either a scalar or a relation.
 */
export function buildTypeOrmRelations<TEntity>(select: Select<TEntity> | undefined, metadata: EntityMetadata): FindOptionsRelations<TEntity> | undefined {
  if (!select) {
    return undefined;
  }

  const output: Record<string, unknown> = {};

  for (const [field, value] of Object.entries(select)) {
    if (!value) {
      continue;
    }

    const relation = metadata.findRelationWithPropertyPath(field);
    if (!relation) {
      continue;
    }

    if (isNestedSelect(value)) {
      assertSupportedRelationFilters(field, value as Record<string, unknown>);
      output[field] = buildTypeOrmRelations(value.select, relation.inverseEntityMetadata) ?? true;
    } else {
      output[field] = true;
    }
  }

  return Object.keys(output).length > 0 ? (output as FindOptionsRelations<TEntity>) : undefined;
}
