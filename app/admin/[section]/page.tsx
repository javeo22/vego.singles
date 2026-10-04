import { notFound } from "next/navigation";
import { adminPage } from "@/lib/operations/admin-page";
export const dynamic = "force-dynamic";
export default async function AdminSection({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (
    ![
      "inventario",
      "importaciones",
      "revisiones",
      "precios",
      "solicitudes",
      "ajustes",
    ].includes(section)
  )
    notFound();
  return adminPage(section);
}
