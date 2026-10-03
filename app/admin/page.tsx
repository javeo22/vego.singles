import { redirect } from "next/navigation";
import Inventory, { type InventoryRow } from "@/components/inventory";
import { createClient } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export default async function Admin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const allow = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  if (!user.email || !allow.includes(user.email.toLowerCase())) redirect("/");
  const [listings, drafts, proposals, inventory] = await Promise.all([
    supabase.from("listings").select("*", { count: "exact", head: true }),
    supabase
      .from("listings")
      .select("*", { count: "exact", head: true })
      .eq("published", false),
    supabase
      .from("price_proposals")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("admin_inventory")
      .select("*")
      .order("canonical_name")
      .limit(100),
  ]);
  return (
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
  );
}
