import { DataSource, EntitySchema } from "typeorm";
import { PGliteDriver } from "typeorm-pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import { TypeOrmDatasource, TypeOrmTransactor } from "../src/index.js";
import { itBehavesLikeADatasource } from "./contract.js";

type Post = {
  id: number;
  title: string;
  authorId: number;
  author?: User;
};

type User = {
  id: number;
  name: string;
  email: string | null;
  age: number;
  status: string;
  posts?: Post[];
};

const UserEntity = new EntitySchema<User>({
  columns: {
    age: { type: Number },
    email: { nullable: true, type: String },
    id: { generated: "increment", primary: true, type: Number },
    name: { name: "display_name", type: String },
    status: { default: "active", type: String },
  },
  name: "User",
  relations: {
    posts: { inverseSide: "author", target: "Post", type: "one-to-many" },
  },
  tableName: "typeorm_users",
});

const PostEntity = new EntitySchema<Post>({
  columns: {
    authorId: { name: "author_id", type: Number },
    id: { generated: "increment", primary: true, type: Number },
    title: { type: String },
  },
  name: "Post",
  relations: {
    author: { joinColumn: { name: "author_id" }, onDelete: "CASCADE", target: "User", type: "many-to-one" },
  },
  tableName: "typeorm_posts",
});

let database: DataSource;
let datasource: TypeOrmDatasource<User, User, { name: string; email?: string | null; age: number; status?: string }>;

beforeAll(async () => {
  database = await new DataSource({
    driver: new PGliteDriver().driver,
    entities: [UserEntity, PostEntity],
    synchronize: true,
    type: "postgres",
  }).initialize();
  datasource = new TypeOrmDatasource(database, UserEntity);
});

afterAll(async () => {
  await database.destroy();
});

beforeEach(async () => {
  await database.query("TRUNCATE typeorm_users, typeorm_posts RESTART IDENTITY CASCADE");
});

describe("TypeOrmDatasource", () => {
  itBehavesLikeADatasource({
    datasource: () => datasource,
    transactor: () => new TypeOrmTransactor(database),
  });

  it("infers the entity type from an EntitySchema", () => {
    const inferred = new TypeOrmDatasource(database, UserEntity);
    expectTypeOf(inferred.list).returns.resolves.toEqualTypeOf<User[]>();
    expectTypeOf(inferred.store).parameter(0).toEqualTypeOf<import("typeorm").DeepPartial<User>>();
  });

  it("hydrates selected updated columns through metadata", async () => {
    const user = await datasource.store({ age: 30, name: "Before" });

    expect(await datasource.modify({ select: { id: true, name: true }, where: { id: { Is: user.id } } }, { name: "After" })).toEqual([
      { id: user.id, name: "After" },
    ]);
  });

  it("selects relations and nested relation fields", async () => {
    const user = await datasource.store({ age: 30, name: "John" });
    await database.getRepository(PostEntity).save([
      { authorId: user.id, title: "Hello" },
      { authorId: user.id, title: "World" },
    ]);

    const [withPosts] = await datasource.list({ select: { id: true, posts: { select: { title: true } } }, where: { id: { Is: user.id } } });

    expect(withPosts).toEqual({ id: user.id, posts: [{ title: "Hello" }, { title: "World" }] });
  });

  it("rejects relation-scoped filtering rather than changing parent-query semantics", async () => {
    await expect(datasource.list({ select: { posts: { where: { title: { Contains: "x" } } } } })).rejects.toThrow('scoped to relation "posts"');
  });
});
