export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SearchTrade } from "@/app/(protected)/trade-tickets/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length < 2) {
    return NextResponse.json([] as SearchTrade[]);
  }

  // Step 1: find product IDs whose ISIN matches
  const { data: matchingProducts } = await supabase
    .from("products")
    .select("id")
    .ilike("isin", `%${q}%`);

  const productIds = (matchingProducts ?? []).map((p: any) => p.id as string);

  // Step 2: find trade IDs matching by reference OR by a matching product ISIN
  // Run both queries in parallel and union the results
  const [{ data: byRef }, { data: byProduct }] = await Promise.all([
    supabase.from("trades").select("id").ilike("reference", `%${q}%`),
    productIds.length > 0
      ? supabase.from("trades").select("id").in("product_id", productIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
  ]);

  const tradeIds = [
    ...new Set([
      ...(byRef ?? []).map((t: any) => t.id as string),
      ...(byProduct ?? []).map((t: any) => t.id as string),
    ]),
  ];

  if (tradeIds.length === 0) {
    return NextResponse.json([] as SearchTrade[]);
  }

  // Step 3: fetch full leg data for those trades in one query
  const { data, error } = await supabase
    .from("trade_legs")
    .select(
      `
      id,
      leg,
      status,
      size,
      counterparty:counterparty_id(legal_name, ssi),
      trade:trade_id(
        id,
        reference,
        trade_date,
        client_name,
        client_contact:client_contact_id(
          id,
          advisor_id,
          first_name,
          family_name
        ),
        booking_entity:booking_entity_id(legal_name),
        product:product_id(
          isin,
          product_name,
          currency,
          settlement
        )
      )
    `
    )
    .in("trade_id", tradeIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group legs by trade
  const rows = (data ?? []) as any[];
  const tradeMap = new Map<string, SearchTrade>();

  for (const r of rows) {
    const t = r.trade;
    if (!t) continue;

    const tradeId: string = t.id;
    if (!tradeMap.has(tradeId)) {
      tradeMap.set(tradeId, {
        tradeId,
        tradeRef: t.reference ?? "-",
        isin: t.product?.isin ?? "-",
        productName: t.product?.product_name ?? "-",
        tradeDate: t.trade_date ?? "",
        clientName: t.client_name ?? "-",
        legs: [],
      });
    }

    tradeMap.get(tradeId)!.legs.push({
      legId: r.id,
      direction: r.leg as "buy" | "sell",
      counterpartyName: r.counterparty?.legal_name ?? "-",
      size: r.size ?? null,
      status: r.status ?? "pending",
    });
  }

  return NextResponse.json(Array.from(tradeMap.values()) as SearchTrade[]);
}
