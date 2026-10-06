import { JSDOM } from "jsdom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://example.com/login",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
});
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
const { render, screen, cleanup, waitFor, fireEvent } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { default: LoginForm } = await import("../components/admin/login-form");
afterEach(cleanup);
function client(signInWithPassword: (input: any) => Promise<any>) {
  return () => ({ auth: { signInWithPassword } }) as unknown as SupabaseClient;
}
const session = {
  data: { session: { user: { id: "test-admin" } } },
  error: null,
};

async function fill() {
  const user = userEvent.setup({ document: dom.window.document });
  await user.type(
    screen.getByLabelText("Usuario (correo electrónico)"),
    "ADMIN@example.com",
  );
  await user.type(screen.getByLabelText("Contraseña"), " ExactPassword!2026 ");
  return user;
}

test("password sign-in uses the existing email identity and enters admin only after a session", async () => {
  const sent: any[] = [];
  let navigated = 0;
  render(
    <LoginForm
      getClient={client(async (input) => {
        sent.push(input);
        return session;
      })}
      onAuthenticated={() => navigated++}
    />,
  );
  const user = await fill();
  assert.equal(
    screen
      .getByLabelText("Usuario (correo electrónico)")
      .getAttribute("autocomplete"),
    "username",
  );
  assert.equal(
    screen.getByLabelText("Contraseña").getAttribute("autocomplete"),
    "current-password",
  );
  await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  await waitFor(() => assert.equal(navigated, 1));
  assert.deepEqual(sent, [
    { email: "admin@example.com", password: " ExactPassword!2026 " },
  ]);
  assert.equal(
    (screen.getByLabelText("Contraseña") as HTMLInputElement).value,
    "",
  );
  assert.equal(screen.queryByText("Enviar enlace"), null);
});

test("failed credentials keep login available for a retry without navigation", async () => {
  let attempts = 0,
    navigated = 0;
  render(
    <LoginForm
      getClient={client(async () =>
        ++attempts === 1
          ? {
              data: { session: null },
              error: {
                code: "invalid_credentials",
                message: "private provider diagnostic",
              },
            }
          : session,
      )}
      onAuthenticated={() => navigated++}
    />,
  );
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  assert.equal(
    (await screen.findByRole("alert")).textContent,
    "Correo o contraseña incorrectos.",
  );
  assert.equal(navigated, 0);
  assert.equal(screen.queryByText("private provider diagnostic"), null);
  await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  await waitFor(() => assert.equal(navigated, 1));
  assert.equal(attempts, 2);
  assert.equal(screen.queryByRole("alert"), null);
});

test("pending password submission cannot create overlapping login requests", async () => {
  let attempts = 0,
    navigated = 0;
  let complete!: (result: any) => void;
  render(
    <LoginForm
      getClient={client(() => {
        attempts++;
        return new Promise((resolve) => {
          complete = resolve;
        });
      })}
      onAuthenticated={() => navigated++}
    />,
  );
  const user = await fill();
  const form = screen.getByLabelText("Contraseña").closest("form")!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  assert.equal(attempts, 1);
  assert.equal(navigated, 0);
  assert.equal(
    (screen.getByLabelText("Contraseña") as HTMLInputElement).disabled,
    true,
  );
  complete(session);
  await waitFor(() => assert.equal(navigated, 1));
  await user.click(screen.getByRole("button", { name: "Mostrar contraseña" }));
  assert.equal(
    screen.getByLabelText("Contraseña").getAttribute("type"),
    "text",
  );
  await user.click(screen.getByRole("button", { name: "Ocultar contraseña" }));
  assert.equal(
    screen.getByLabelText("Contraseña").getAttribute("type"),
    "password",
  );
});

test("no session or a network failure never enters admin", async () => {
  let attempts = 0,
    navigated = 0;
  render(
    <LoginForm
      getClient={client(async () => {
        if (++attempts === 1) return { data: { session: null }, error: null };
        throw new Error("offline");
      })}
      onAuthenticated={() => navigated++}
    />,
  );
  const user = await fill();
  await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  assert.match(
    (await screen.findByRole("alert")).textContent!,
    /No se pudo completar/,
  );
  await user.click(screen.getByRole("button", { name: "Iniciar sesión" }));
  assert.match(
    (await screen.findByRole("alert")).textContent!,
    /No se puede iniciar sesión/,
  );
  assert.equal(navigated, 0);
});
