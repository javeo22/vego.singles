import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
export const owner = "00000000-0000-4000-8000-000000000001";
export const reviewer = "00000000-0000-4000-8000-000000000002";
export const stock = "00000000-0000-4000-8000-000000000003";
export async function database(beforeOperations = "") {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key,email text);
    create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'anon') $$;
    create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('email',(select email from auth.users where id=auth.uid())) $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    insert into auth.users values ('${owner}','jav22vega@gmail.com'),('${reviewer}','review@example.com'),('${stock}','stock@example.com');`);
  const initial = await readFile(
    "supabase/migrations/202607300001_initial_schema.sql",
    "utf8",
  );
  // UUID generation is built into PostgreSQL. PGlite does not bundle pgcrypto.
  await db.exec(
    initial.replace("create extension if not exists pgcrypto;", ""),
  );
  if (beforeOperations) await db.exec(beforeOperations);
  const migration = await readFile(
    "supabase/migrations/202610040001_operations.sql",
    "utf8",
  );
  try {
    await db.exec(migration);
  } catch (e) {
    const err = e as {
      message: string;
      position?: string;
      where?: string;
      internalQuery?: string;
    };
    const pos = Number(err.position || 0);
    await db.close();
    throw new Error(
      `${err.message}; position ${pos}; ${err.where || ""}; ${err.internalQuery || migration.slice(Math.max(0, pos - 200), pos + 200)}`,
    );
  }
  await db.exec(
    await readFile(
      "supabase/migrations/202610070001_price_verification.sql",
      "utf8",
    ),
  );
  await db.exec(
    `insert into admin_memberships values ('${reviewer}','reviewer',now()),('${stock}','stock',now());`,
  );
  await actor(db, owner);
  return db;
}
export async function actor(db: PGlite, id = owner, role = "authenticated") {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",
    [id, role],
  );
  await db.exec(`set role ${role}`);
}
export async function command(
  db: PGlite,
  action: string,
  payload: unknown,
  key = crypto.randomUUID(),
) {
  const result = await db.query<{ result: any }>(
    "select admin_command($1,$2::jsonb,$3::uuid) result",
    [action, JSON.stringify(payload), key],
  );
  return result.rows[0].result;
}
export async function listing(db: PGlite, quantity = 3) {
  await db.exec("reset role");
  const c = await db.query<{ id: string }>(
    "insert into card_printings(game,canonical_name,set_name,collector_number,language,identity_verified) values('pokemon','Test Card','Test Set',gen_random_uuid()::text,'en',true) returning id",
  );
  const l = await db.query<{ id: string }>(
    "insert into listings(card_printing_id,condition,finish,approved_price_crc,price_verified,acquisition_cost,cost_confirmed,published) values($1,'Near Mint','Holofoil',10000,true,6000,true,true) returning id",
    [c.rows[0].id],
  );
  await db.query(
    "insert into stock_lots(listing_id,location_code,quantity) values($1,'SHELF1',$2)",
    [l.rows[0].id, quantity],
  );
  await actor(db);
  return l.rows[0].id;
}
