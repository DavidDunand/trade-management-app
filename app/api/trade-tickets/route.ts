export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { TicketRecord } from "@/app/(protected)/trade-tickets/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const legId = req.nextUrl.searchParams.get("legId");
  if (!legId) {
    return NextResponse.json([] as TicketRecord[]);
  }

  const { data, error } = await supabase
    .from("trade_tickets")
    .select(
      `
      id,
      format,
      created_at,
      generated_by:generated_by(full_name)
    `
    )
    .eq("leg_id", legId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const records: TicketRecord[] = (data ?? []).map((r: any) => ({
    id: r.id,
    format: r.format,
    generatedBy: r.generated_by?.full_name ?? "Unknown",
    createdAt: r.created_at,
  }));

  return NextResponse.json(records);
}
