import "server-only";
import { createClient as createSdk } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSameOrigin } from "./origin";
export async function adminClient() {
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user)
    throw new OperationError("Inicia sesión para continuar", 401);
  const { data: role, error: roleError } = await db.rpc("current_admin_role");
  if (roleError)
    throw new OperationError(
      "La actualización de administración está pendiente de instalar",
      503,
    );
  if (!role) throw new OperationError("No tienes acceso a administración", 403);
  return { db, role: role as "owner" | "reviewer" | "stock", user };
}
export function serviceClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new OperationError(
      "El registro de solicitudes todavía no está disponible",
      503,
    );
  return createSdk(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
export class OperationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function assertSameOrigin(request: Request) {
  if (!isSameOrigin(request))
    throw new OperationError("Origen no permitido", 403);
}
export async function body(request: Request) {
  if (Number(request.headers.get("content-length") || 0) > 2100000)
    throw new OperationError("El archivo supera 2 MB", 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > 2100000)
    throw new OperationError("El archivo supera 2 MB", 413);
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed;
  } catch {
    throw new OperationError("Solicitud inválida");
  }
}
export function databaseError(error: {
  code?: string;
  message: string;
}): never {
  if (
    ["42P01", "42883", "42703", "PGRST202", "PGRST205"].includes(
      error.code || "",
    )
  )
    throw new OperationError(
      "La actualización de administración está pendiente de instalar",
      503,
    );
  if (error.code === "42501")
    throw new OperationError("No tienes permiso para esta operación", 403);
  if (error.code === "23505")
    throw new OperationError(
      "Ya existe esta variante o trabajo. Revisa los duplicados.",
      409,
    );
  if (error.code === "P0001") throw new OperationError(error.message, 409);
  throw new OperationError(
    "No se pudo completar la operación. Intenta de nuevo.",
    502,
  );
}
