import { And, Equal, type FindOperator, type FindOptionsWhere, ILike, In, IsNull, LessThan, LessThanOrEqual, MoreThan, MoreThanOrEqual, Not } from "typeorm";
import { escapeLike, isBlank, isEnabled, operatorEntries, splitWhere } from "../shared.js";
import type { FieldOperators, Operator, Where } from "../types.js";

type Value = string | number | bigint | boolean | Date;
type Condition = FindOperator<Value>;
type Builder = (value: unknown) => Condition | undefined;

const comparison =
  (build: (value: Value) => Condition): Builder =>
  (value) =>
    isBlank(value) ? undefined : build(value as Value);
const list =
  (build: (values: Value[]) => Condition): Builder =>
  (value) =>
    Array.isArray(value) ? build(value as Value[]) : undefined;
const flag =
  (build: () => Condition): Builder =>
  (value) =>
    isEnabled(value) ? build() : undefined;
const pattern = (wrap: (value: string) => string): Builder => comparison((value) => ILike(wrap(escapeLike(String(value)))) as FindOperator<Value>);

const operators: Record<Operator, Builder> = {
  Contains: pattern((value) => `%${value}%`),
  EndsWith: pattern((value) => `%${value}`),
  GT: comparison((value) => MoreThan(value)),
  GTE: comparison((value) => MoreThanOrEqual(value)),
  In: list((values) => In(values)),
  Is: comparison((value) => Equal(value)),
  IsNot: comparison((value) => Not(Equal(value))),
  IsNotNull: flag(() => Not(IsNull()) as FindOperator<Value>),
  IsNull: flag(() => IsNull() as FindOperator<Value>),
  LT: comparison((value) => LessThan(value)),
  LTE: comparison((value) => LessThanOrEqual(value)),
  NotIn: list((values) => Not(In(values))),
  StartsWith: pattern((value) => `${value}%`),
};

function buildField(condition: FieldOperators<unknown>): Condition | undefined {
  const output = operatorEntries(condition).flatMap(([operator, value]) => {
    const built = operators[operator](value);
    return built === undefined ? [] : [built];
  });

  if (output.length === 0) {
    return undefined;
  }

  return output.length === 1 ? output[0] : (And(...output) as FindOperator<Value>);
}

function merge(left: Record<string, unknown>, right: Record<string, unknown>): Record<string, unknown> {
  const output = { ...left };

  for (const [field, condition] of Object.entries(right)) {
    const current = output[field];
    output[field] = current === undefined ? condition : And(current as FindOperator<unknown>, condition as FindOperator<unknown>);
  }

  return output;
}

function alternatives<TEntity>(where?: Where<TEntity>): Record<string, unknown>[] {
  const base: Record<string, unknown> = {};
  const { fields, groups } = splitWhere(where);

  for (const [field, condition] of fields) {
    const built = buildField(condition);
    if (built !== undefined) {
      base[field] = built;
    }
  }

  const branches = groups.flatMap((group) => alternatives(group)).filter((branch) => Object.keys(branch).length > 0);
  return branches.length === 0 ? [base] : branches.map((branch) => merge(base, branch));
}

/**
 * TypeORM represents OR conditions as an array of where objects. Nested `OneOf`
 * groups are distributed into that form while preserving AND conditions.
 */
export type TypeOrmWhere<TEntity> = FindOptionsWhere<TEntity> | FindOptionsWhere<TEntity>[];

/** Converts a generic Where clause into TypeORM find options. */
export function buildTypeOrmWhere<TEntity>(where?: Where<TEntity>): TypeOrmWhere<TEntity> {
  const output = alternatives(where);

  if (output.length === 1) {
    return output[0] as FindOptionsWhere<TEntity>;
  }

  return output as FindOptionsWhere<TEntity>[];
}
