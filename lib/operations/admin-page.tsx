import { redirect } from "next/navigation";
import OperationsWorkspace from "@/components/admin/workspace";
import Inventory, { type InventoryRow } from "@/components/inventory";
import { adminClient, OperationError } from "./server";
import { createClient } from "@/lib/supabase/server";
export async function adminPage(section = "") {
  try {
    const { role } = await adminClient();
    return <OperationsWorkspace section={section} role={role} />;
  } catch (e) {
    if (e instanceof OperationError && e.status === 401) redirect("/login");
    if (e instanceof OperationError && e.status === 403) redirect("/");
    if (!(e instanceof OperationError) || e.status !== 503) throw e;
  }
  // Preserve the existing dashboard until the versioned database migration is installed.
  if (section) return <OperationsWorkspace section={section} role={null} />;
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");
  const allow = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase());
  if (!user.email || !allow.includes(user.email.toLowerCase())) redirect("/");
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
