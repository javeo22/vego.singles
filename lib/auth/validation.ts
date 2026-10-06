import { z } from "zod";
export const passwordSchema = z
  .string()
  .min(8, "Usa al menos 8 caracteres.")
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    "La contraseña supera 72 bytes.",
  );
const email = z
  .string()
  .trim()
  .email("Indica un correo válido.")
  .transform((value) => value.toLowerCase());
export const accountPasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Indica tu contraseña actual.")
      .max(1024),
    password: passwordSchema,
    confirmation: z.string(),
  })
  .strict()
  .refine((input) => input.password === input.confirmation, {
    message: "Las contraseñas no coinciden.",
    path: ["confirmation"],
  });
export const usersSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("create_user"),
      email,
      password: passwordSchema,
      role: z.enum(["owner", "reviewer", "stock"]),
      key: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("reset_password"),
      email,
      password: passwordSchema,
    })
    .strict(),
]);
export class AccountOperationError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
