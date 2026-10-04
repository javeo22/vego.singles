import { adminPage } from "@/lib/operations/admin-page";
export const dynamic = "force-dynamic";
export default async function Admin() {
  return adminPage();
}
