import type { SupabaseClient } from "@supabase/supabase-js";
import type { OperationRole } from "@/lib/operations/types";
import { AccountOperationError } from "./validation";
import { setExistingAdminPassword } from "./admin-password";
export function requireUserManager(role: OperationRole) {
  if (role !== "owner")
    throw new AccountOperationError(
      "Solo un propietario puede administrar usuarios.",
      403,
    );
}
export async function createAdminUser(
  db: SupabaseClient,
  service: SupabaseClient,
  role: OperationRole,
  input: { email: string; password: string; role: OperationRole; key: string },
) {
  requireUserManager(role);
  const { data, error } = await service.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });
  if (error) {
    if (["email_exists", "user_already_exists"].includes(error.code || ""))
      throw new AccountOperationError(
        "La cuenta ya existe. Usa Asignar acceso a una cuenta existente.",
        409,
      );
    throw new AccountOperationError(
      "No se pudo crear la cuenta. Comprueba el correo y la política de contraseñas.",
    );
  }
  if (!data.user)
    throw new AccountOperationError(
      "No se pudo confirmar la creación de la cuenta.",
      502,
    );
  // Only role metadata reaches the transactional command and activity log.
  const { error: roleError } = await db.rpc("admin_command", {
    p_action: "membership",
    p_payload: { email: input.email, role: input.role },
    p_key: input.key,
  });
  if (roleError)
    return {
      message:
        "La cuenta fue creada, pero su acceso quedó pendiente. Asígnale el rol desde Usuarios.",
      pendingEmail: input.email,
      status: 202,
    };
  return { message: "Usuario creado y acceso asignado.", status: 201 };
}
export async function resetAdminPassword(
  service: SupabaseClient,
  role: OperationRole,
  input: { email: string; password: string },
) {
  requireUserManager(role);
  // Resets only existing, currently authorized admins; revoked accounts stay revoked.
  await setExistingAdminPassword(service, input.email, input.password);
  return {
    message: "Contraseña actualizada. Comunícala al usuario de forma privada.",
  };
}
