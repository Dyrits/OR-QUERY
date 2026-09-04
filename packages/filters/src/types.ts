/**
 * Available filter operators for query conditions.
 */
export type Operator = "Is" | "IsNot" | "GT" | "GTE" | "LT" | "LTE" | "In" | "NotIn" | "Contains" | "StartsWith" | "EndsWith" | "IsNull" | "IsNotNull";

/**
 * Primitive value types that can be filtered, ordered and selected directly.
 */
export type Scalar = string | number | bigint | boolean | Date;

/**
 * Removes `null`, `undefined` and array wrappers from a type, so that relation fields resolve to the related entity type.
 */
export type Unwrap<TValue> = NonNullable<TValue> extends (infer TItem)[] ? NonNullable<TItem> : NonNullable<TValue>;

/**
 * Keys of an entity that hold scalar values, or arrays of scalars. Relations are excluded, since they cannot be filtered or sorted on directly.
 * Keys typed as `unknown` or `any` are kept, so loosely typed entities remain usable.
 */
export type ScalarKeys<TEntity> = {
  [Key in keyof TEntity]-?: unknown extends TEntity[Key] ? Key : Unwrap<TEntity[Key]> extends Scalar ? Key : never;
}[keyof TEntity];

/**
 * Operators that can be applied to a single field.
 * Text operators (`Contains`, `StartsWith`, `EndsWith`) are case-insensitive across all targets.
 * `IsNull` and `IsNotNull` are applied unless set to `false`.
 */
export type FieldOperators<TValue> = {
  Is?: TValue;
  IsNot?: TValue;
  GT?: TValue;
  GTE?: TValue;
  LT?: TValue;
  LTE?: TValue;
  In?: readonly TValue[];
  NotIn?: readonly TValue[];
  Contains?: string;
  StartsWith?: string;
  EndsWith?: string;
  IsNull?: boolean;
  IsNotNull?: boolean;
};

/**
 * Where clause for filtering entities. Only scalar fields can be filtered, relations are handled through nested `Select` filters.
 * Each field can have one or more operators applied, all combined with AND.
 * Use `OneOf` for OR logic between multiple groups of conditions.
 *
 * @example
 * ```ts
 * const where: Where<User> = {
 *   name: { Contains: "john" },
 *   age: { GTE: 18, LTE: 65 },
 *   OneOf: [{ status: { Is: "active" } }, { role: { Is: "admin" } }],
 * };
 * ```
 */
export type Where<TEntity> = {
  [Key in ScalarKeys<TEntity>]?: FieldOperators<NonNullable<TEntity[Key]>>;
} & { OneOf?: Where<TEntity>[] };

/**
 * Select clause for choosing which fields to include.
 * Scalar fields are included with `true`.
 * Relation fields accept either `true` or nested query filters applied to the related entity.
 *
 * @example
 * ```ts
 * const select: Select<User> = {
 *   id: true,
 *   name: true,
 *   posts: { select: { title: true }, where: { published: { Is: true } }, limit: 5 },
 * };
 * ```
 */
export type Select<TEntity> = {
  [Key in keyof TEntity]?: Unwrap<TEntity[Key]> extends Scalar ? boolean : boolean | QueryFilters<Unwrap<TEntity[Key]>>;
};

/**
 * Select clause restricted to scalar fields, as accepted by write operations that cannot return relations.
 */
export type ScalarSelect<TEntity> = {
  [Key in ScalarKeys<TEntity>]?: boolean;
};

/**
 * Order direction for sorting.
 */
export type OrderDirection = "asc" | "desc";

/**
 * Order clause for sorting entities.
 * Keys are applied in insertion order, so the first key is the primary sort.
 */
export type Order<TEntity> = {
  [Key in ScalarKeys<TEntity>]?: OrderDirection;
};

/**
 * Complete query filters including where, select, order and pagination clauses.
 */
export type QueryFilters<TEntity> = {
  where?: Where<TEntity>;
  select?: Select<TEntity>;
  order?: Order<TEntity>;
  limit?: number;
  offset?: number;
};
