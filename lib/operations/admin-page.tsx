import { redirect } from "next/navigation";
import OperationsWorkspace from "@/components/admin/workspace";
import Inventory, { type InventoryRow } from "@/components/inventory";
import { adminClient, OperationError } from "./server";
import { createClient } from "@/lib/supabase/server";
export async function adminPage(section = "") {
  try {
    const { role } = await adminClient();
    if (section === "usuarios" && role !== "owner") redirect("/admin");
    return <OperationsWorkspace section={section} role={role} />;
  } catch (e) {
    if (e instanceof OperationError && e.status === 401) redirect("/login");
    if (e instanceof OperationError && e.status === 403) redirect("/");
    if (!(e instanceof OperationError) || e.status !== 503) throw e;
  }
  // Preserve the existing dashboard until the versioned database migration is installed.
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const allow = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  if (!user.email || !allow.includes(user.email.toLowerCase())) redirect("/");
  if (["ajustes", "usuarios"].includes(section))
    return <OperationsWorkspace section={section} role="owner" accountOnly />;
  if (section) return <OperationsWorkspace section={section} role={null} />;
  const [listings, drafts, proposals, inventory] = await Promise.all([
    db.from("listings").select("*", { count: "exact", head: true }),
    db
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("published", false),
    db
      .from("price_proposals")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    db.from("admin_inventory").select("*").order("canonical_name").limit(100),
  ]);
  return (
    <>
      <p className="wide ops-error" role="status">
        La nueva administración se activa al instalar la migración de la guía.
        El panel actual sigue disponible.
      </p>
      <nav className="wide ops-title-row" aria-label="Cuenta administradora">
        <a href="/admin/ajustes">Ajustes de mi cuenta</a>
        <a href="/admin/usuarios">Usuarios</a>
      </nav>
      <Inventory
        rows={(inventory.data || []) as InventoryRow[]}
        counts={{
          listings: listings.count || 0,
          drafts: drafts.count || 0,
          proposals: proposals.count || 0,
        }}
        unavailable={Boolean(
          listings.error || drafts.error || proposals.error || inventory.error,
        )}
      />
    </>
  );
}
