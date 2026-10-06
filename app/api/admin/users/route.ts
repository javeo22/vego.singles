import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminClient,
  assertSameOrigin,
  body,
  serviceClient,
  OperationError,
} from "@/lib/operations/server";
import { usersSchema, AccountOperationError } from "@/lib/auth/validation";
import {
  createAdminUser,
  requireUserManager,
  resetAdminPassword,
} from "@/lib/auth/user-management";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { db, role } = await adminClient();
    requireUserManager(role);
    const input = usersSchema.parse(await body(request));
    const service = serviceClient(
      "La creación y recuperación de cuentas no está disponible. Contacta al administrador del proyecto.",
    );
    if (input.action === "create_user") {
      const { status, ...result } = await createAdminUser(
        db,
        service,
        role,
        input,
      );
      return NextResponse.json(result, { status });
    }
    return NextResponse.json(await resetAdminPassword(service, role, input));
  } catch (error) {
    if (
      error instanceof OperationError ||
      error instanceof AccountOperationError
    )
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: error.issues[0]?.message || "Revisa la cuenta." },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "No se pudo completar la operación de usuario." },
      { status: 502 },
    );
  }
}
