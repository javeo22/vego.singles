import type { SupabaseClient } from "@supabase/supabase-js";
import { passwordSchema, AccountOperationError } from "./validation";

export function validateAdminPassword(email: string, password: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    throw new AccountOperationError(
      "Indica el correo de una cuenta administradora existente.",
    );
  if (!passwordSchema.safeParse(password).success)
    throw new AccountOperationError(
      "Usa una contraseña de al menos 8 caracteres y máximo 72 bytes.",
    );
}

export async function setExistingAdminPassword(
  db: SupabaseClient,
  email: string,
  password: string,
  legacyEmails: string[] = [],
) {
  validateAdminPassword(email, password);
  const normalized = email.trim().toLowerCase();
  let userId: string | undefined;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error)
      throw new AccountOperationError(
        "No se pudieron consultar las cuentas. Comprueba la clave de servidor y el proyecto.",
      );
    userId = data.users.find(
      (user) => user.email?.toLowerCase() === normalized,
    )?.id;
    if (userId || data.users.length < 200) break;
  }
  if (!userId)
    throw new AccountOperationError(
      "La cuenta no existe. Créala en Supabase Auth y asígnale acceso antes de continuar.",
    );

  const { data: membership, error } = await db
    .from("admin_memberships")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  const legacySchema = error && ["42P01", "PGRST205"].includes(error.code);
  if (error && !legacySchema)
    throw new AccountOperationError(
      "No se pudo verificar el acceso administrador. No se cambió la contraseña.",
    );
  const authorized = legacySchema
    ? legacyEmails.some(
        (allowed) => allowed.trim().toLowerCase() === normalized,
      )
    : membership && ["owner", "reviewer", "stock"].includes(membership.role);
  if (!authorized)
    throw new AccountOperationError(
      "Esta cuenta no tiene acceso administrador. No se cambió la contraseña.",
    );

  // Privileged operator sets credentials for an already-authorized identity.
  // No new user, role, invitation or email is created by this command.
  const { error: updateError } = await db.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (updateError)
    throw new AccountOperationError(
      "No se pudo guardar la contraseña. Comprueba la política de contraseñas de Supabase.",
    );
}
