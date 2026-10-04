import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET() {
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("storefront_settings");
    if (error)
      return NextResponse.json({
        deliveryFeeCrc: null,
        requestsEnabled: false,
      });
    return NextResponse.json({
      ...data,
      requestsEnabled: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    });
  } catch {
    return NextResponse.json({ deliveryFeeCrc: null, requestsEnabled: false });
  }
}
