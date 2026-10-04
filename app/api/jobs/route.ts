import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/operations/server";
import { runNextJob } from "@/lib/operations/jobs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  const incoming = Buffer.from(request.headers.get("authorization") || "");
  const authorization = Buffer.from(`Bearer ${expected || ""}`);
  if (
    !expected ||
    incoming.length !== authorization.length ||
    !timingSafeEqual(incoming, authorization)
  )
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const db = serviceClient();
    const { error } = await db.rpc("admin_command", {
      p_action: "enqueue_refresh",
      p_payload: {},
      p_key: crypto.randomUUID(),
    });
    if (error) throw new Error();
    const result = await runNextJob(db);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "No se pudo procesar la cola" },
      { status: 503 },
    );
  }
}
