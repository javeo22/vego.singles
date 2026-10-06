import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setExistingAdminPassword } from "../lib/auth/admin-password";

const email = "admin@example.com",
  password = "Fixture-Password!2026";
function mock({
  membership = { role: "owner" },
  lookupError = null,
  updateError = null,
  laterPage = false,
}: {
  membership?: { role: string } | null;
  lookupError?: any;
  updateError?: any;
  laterPage?: boolean;
} = {}) {
  const updates: any[] = [],
    pages: number[] = [];
  const users = [{ id: "existing-admin-id", email }];
  const db = {
    auth: {
      admin: {
        listUsers: async ({ page }: { page: number }) => {
          pages.push(page);
          return {
            error: null,
            data: {
              users:
                laterPage && page === 1
                  ? Array.from({ length: 200 }, (_, i) => ({
                      id: String(i),
                      email: `other-${i}@example.com`,
                    }))
                  : users,
            },
          };
        },
        updateUserById: async (id: string, input: any) => {
          updates.push({ id, input });
          return { error: updateError };
        },
      },
    },
    from: (table: string) => {
      assert.equal(table, "admin_memberships");
      return {
        select: () => ({
          eq: (_key: string, id: string) => {
            assert.equal(id, "existing-admin-id");
            return {
              maybeSingle: async () => ({
                data: membership,
                error: lookupError,
              }),
            };
          },
        }),
      };
    },
  } as unknown as SupabaseClient;
  return { db, updates, pages };
}

test("password setup updates only an existing authorized admin without creating a new identity", async () => {
  const m = mock({ laterPage: true });
  await setExistingAdminPassword(m.db, " ADMIN@example.com ", password);
  assert.deepEqual(m.pages, [1, 2]);
  assert.deepEqual(m.updates, [
    { id: "existing-admin-id", input: { password, email_confirm: true } },
  ]);
});

test("a revoked membership cannot fall back to the old email allowlist", async () => {
  const m = mock({ membership: null });
  await assert.rejects(
    setExistingAdminPassword(m.db, email, password, [email]),
    /no tiene acceso/,
  );
  assert.equal(m.updates.length, 0);
});

test("legacy accounts can set passwords only when their email is authorized", async () => {
  const m = mock({ lookupError: { code: "PGRST205" } });
  await assert.rejects(
    setExistingAdminPassword(m.db, email, password, ["another@example.com"]),
    /no tiene acceso/,
  );
  assert.equal(m.updates.length, 0);
  await setExistingAdminPassword(m.db, email, password, [email]);
  assert.equal(m.updates.length, 1);
});

test("membership lookup errors and rejected passwords do not report success or expose secrets", async () => {
  const unavailable = mock({ lookupError: { code: "502" } });
  await assert.rejects(
    setExistingAdminPassword(unavailable.db, email, password, [email]),
    /No se pudo verificar/,
  );
  assert.equal(unavailable.updates.length, 0);
  const rejected = mock({ updateError: { message: password } });
  await assert.rejects(
    setExistingAdminPassword(rejected.db, email, password),
    (error: any) =>
      !error.message.includes(password) &&
      error.message.includes("No se pudo guardar"),
  );
});

test("invalid account names and weak initial passwords are rejected before querying users", async () => {
  const m = mock();
  await assert.rejects(
    setExistingAdminPassword(m.db, "not-an-email", password),
    /correo/,
  );
  await assert.rejects(
    setExistingAdminPassword(m.db, email, "short"),
    /8 caracteres/,
  );
  assert.deepEqual(m.pages, []);
  assert.deepEqual(m.updates, []);
});
