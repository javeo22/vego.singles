import { NextResponse } from "next/server";
import { z } from "zod";
import {
  accountAdminClient,
  assertSameOrigin,
  body,
  OperationError,
} from "@/lib/operations/server";
import {
  accountPasswordSchema,
  AccountOperationError,
} from "@/lib/auth/validation";
import { changeOwnPassword } from "@/lib/auth/account-password";
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { db, user } = await accountAdminClient();
    const input = accountPasswordSchema.parse(await body(request));
    await changeOwnPassword(db, user, input);
    return NextResponse.json({
      message:
        "Contraseña cambiada. Usa la nueva contraseña la próxima vez que ingreses.",
    });
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
        { error: error.issues[0]?.message || "Revisa las contraseñas." },
        { status: 400 },
      );
    return NextResponse.json(
      { error: "No se pudo cambiar la contraseña. Intenta de nuevo." },
      { status: 502 },
    );
  }
}
