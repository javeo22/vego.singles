import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { changeOwnPassword } from "../lib/auth/account-password";
import {
  createAdminUser,
  resetAdminPassword,
} from "../lib/auth/user-management";
import {
  accountPasswordSchema,
  passwordSchema,
  usersSchema,
} from "../lib/auth/validation";
const password = "Eight456",
  email = "staff@example.com",
  key = "00000000-0000-4000-8000-000000000123";
const input = { email, password, role: "stock" as const, key };
test("eight-character passwords are accepted without storing a default credential", () => {
  assert.equal(passwordSchema.safeParse(password).success, true);
  assert.equal(passwordSchema.safeParse("short").success, false);
  assert.equal(
    accountPasswordSchema.safeParse({
      currentPassword: "old",
      password,
      confirmation: "different",
    }).success,
    false,
  );
  assert.equal(
    usersSchema.safeParse({ ...input, action: "create_user", unexpected: true })
      .success,
    false,
  );
});
test("self-service password changes verify the current credentials and same identity before updating", async () => {
  const sent: any[] = [];
  const db = {
    auth: {
      signInWithPassword: async (p: any) => {
        sent.push(p);
        return { data: { user: { id: "caller" }, session: {} }, error: null };
      },
      updateUser: async (p: any) => {
        sent.push(p);
        return { error: null };
      },
    },
  } as unknown as SupabaseClient;
  await changeOwnPassword(
    db,
    { id: "caller", email },
    { currentPassword: "current-fixture", password },
  );
  assert.deepEqual(sent, [
    { email, password: "current-fixture" },
    { password },
  ]);
});
test("invalid credentials and mismatched session identity cannot update passwords", async () => {
  let updates = 0;
  const db = {
    auth: {
      signInWithPassword: async () => ({
        data: { user: { id: "another" }, session: {} },
        error: null,
      }),
      updateUser: async () => {
        updates++;
        return { error: null };
      },
    },
  } as unknown as SupabaseClient;
  await assert.rejects(
    changeOwnPassword(
      db,
      { id: "caller", email },
      { currentPassword: "wrong", password },
    ),
    /contraseña actual/,
  );
  assert.equal(updates, 0);
});
function createMock(failedRole = false, createError: any = null) {
  const calls: any[] = [];
  const service = {
    auth: {
      admin: {
        createUser: async (p: any) => {
          calls.push({ create: p });
          return {
            data: { user: createError ? null : { id: "new-id" } },
            error: createError,
          };
        },
      },
    },
  } as unknown as SupabaseClient;
  const db = {
    rpc: async (name: string, p: any) => {
      calls.push({ name, p });
      return { error: failedRole ? { code: "502" } : null };
    },
  } as unknown as SupabaseClient;
  return { calls, service, db };
}
test("user creation sends only role metadata to operation receipts and preserves password secrecy", async () => {
  const m = createMock();
  const result = await createAdminUser(m.db, m.service, "owner", input);
  assert.equal(result.status, 201);
  assert.equal(m.calls[0].create.password, password);
  assert.deepEqual(m.calls[1].p.p_payload, { email, role: "stock" });
  assert.equal(JSON.stringify(m.calls[1]).includes(password), false);
  assert.equal(JSON.stringify(result).includes(password), false);
});
test("non-owners cannot create accounts or reset another user's password", async () => {
  const m = createMock();
  await assert.rejects(
    createAdminUser(m.db, m.service, "stock", input),
    /propietario/,
  );
  await assert.rejects(
    resetAdminPassword(m.service, "reviewer", input),
    /propietario/,
  );
  assert.deepEqual(m.calls, []);
});
test("partial account creation keeps the identity recoverable and explicitly reports pending access", async () => {
  const m = createMock(true);
  const result = await createAdminUser(m.db, m.service, "owner", input);
  assert.equal(result.status, 202);
  assert.equal(result.pendingEmail, email);
  assert.equal(JSON.stringify(result).includes(password), false);
});
test("creating an existing account never overwrites its password", async () => {
  const m = createMock(false, { code: "email_exists" });
  await assert.rejects(
    createAdminUser(m.db, m.service, "owner", input),
    /cuenta ya existe/,
  );
  assert.equal(m.calls.length, 1);
});
