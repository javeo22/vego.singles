import type { SupabaseClient } from "@supabase/supabase-js";
import { AccountOperationError } from "./validation";
export async function changeOwnPassword(
  db: SupabaseClient,
  user: { id: string; email?: string },
  input: { currentPassword: string; password: string },
) {
  if (!user.email)
    throw new AccountOperationError("La cuenta no tiene un correo habilitado.");
  const { data, error } = await db.auth.signInWithPassword({
    email: user.email,
    password: input.currentPassword,
  });
  if (error?.status === 429)
    throw new AccountOperationError(
      "Demasiados intentos. Espera unos minutos.",
      429,
    );
  if (error && error.code !== "invalid_credentials")
    throw new AccountOperationError(
      "No se pudo verificar tu contraseña. Intenta de nuevo.",
      503,
    );
  if (error || !data.session || data.user?.id !== user.id)
    throw new AccountOperationError("La contraseña actual es incorrecta.");
  const { error: updateError } = await db.auth.updateUser({
    password: input.password,
  });
  if (updateError)
    throw new AccountOperationError(
      "No se pudo cambiar la contraseña. Comprueba la política del proyecto e intenta de nuevo.",
    );
}
