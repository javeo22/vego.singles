import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { setExistingAdminPassword } from "../lib/auth/admin-password";

async function main() {
  const email = process.argv[2];
  if (!email || process.argv.length !== 3)
    throw new Error(
      "Uso: npm run admin:set-password -- CORREO_ADMIN. La contraseña se pide de forma oculta, nunca como argumento.",
    );
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Configura NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en un entorno privado o .env.local.",
    );
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new Error(
      "Ejecuta el comando en una terminal interactiva para ingresar la contraseña sin mostrarla.",
    );
  const hiddenOutput = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const input = createInterface({
    input: process.stdin,
    output: hiddenOutput,
    terminal: true,
    historySize: 0,
  });
  try {
    process.stdout.write("Contraseña nueva (entrada oculta): ");
    const password = await input.question("");
    process.stdout.write("\nRepite la contraseña (entrada oculta): ");
    const confirmation = await input.question("");
    process.stdout.write("\n");
    if (password !== confirmation)
      throw new Error("Las contraseñas no coinciden. No se cambió la cuenta.");
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await setExistingAdminPassword(
      db,
      email,
      password,
      (process.env.ADMIN_EMAILS || "").split(","),
    );
    process.stdout.write(
      "Contraseña configurada. Ingresa en /login con ese correo y la contraseña elegida.\n",
    );
  } finally {
    input.close();
    hiddenOutput.end();
  }
}
main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "No se pudo completar la operación."}\n`,
  );
  process.exitCode = 1;
});
