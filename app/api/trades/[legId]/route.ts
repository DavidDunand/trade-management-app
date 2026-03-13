export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { TradeLeg, BookingEntity } from "@/app/(protected)/trade-tickets/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function resolveBookingEntity(legalName: string): BookingEntity {
  return legalName.toLowerCase().includes("valeur")
    ? "Valeur Securities AG, Switzerland"
    : "RiverRock Securities SAS, France";
}

function computeNetAmount(settlementType: string, size: number, price: number): number {
  if (settlementType === "units") return size * price;
  return (size * price) / 100;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ legId: string }> }
) {
  const { legId } = await params;

  const { data, error } = await supabase
    .from("trade_legs")
    .select(
      `
      id,
      trade_id,
      leg,
      size,
      counterparty_id,
      counterparty:counterparty_id(legal_name, ssi),
      trade:trade_id(
        id,
        reference,
        trade_date,
        value_date,
        buy_price,
        sell_price,
        client_name,
        client_contact:client_contact_id(
          id,
          advisor_id,
          first_name,
          family_name
        ),
        booking_entity:booking_entity_id(legal_name),
        distributing_entity:distributing_entity_id(legal_name),
        product:product_id(isin, product_name, currency, settlement)
      )
    `
    )
    .eq("id", legId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Leg not found" }, { status: 404 });
  }

  const r = data as any;
  const t = r.trade;
  const p = t?.product;
  const bookingEntity = resolveBookingEntity(t?.booking_entity?.legal_name ?? "");
  // Distributing entity drives the template (header, footer, dealer SSI block)
  const distributingEntity = resolveBookingEntity(t?.distributing_entity?.legal_name ?? "");
  const isDistValeur = distributingEntity === "Valeur Securities AG, Switzerland";
  const direction: "buy" | "sell" = r.leg === "buy" ? "buy" : "sell";
  const clientPrice: number | undefined =
    direction === "sell" ? (t?.sell_price ?? undefined) : (t?.buy_price ?? undefined);
  const size: number = r.size ?? 0;
  const settlementType: "percent" | "units" = p?.settlement ?? "percent";
  const netAmount = computeNetAmount(settlementType, size, clientPrice ?? 0);

  // For RiverRock: fetch the opposite-direction leg's counterparty SSI (the actual dealer)
  let dealerSSI: string | undefined = undefined;
  if (!isDistValeur) {
    const dealerDirection = direction === "sell" ? "buy" : "sell";
    const { data: dealerLegData } = await supabase
      .from("trade_legs")
      .select("counterparty:counterparty_id(ssi)")
      .eq("trade_id", r.trade_id)
      .eq("leg", dealerDirection)
      .limit(1)
      .maybeSingle();
    dealerSSI = (dealerLegData as any)?.counterparty?.ssi ?? undefined;
  }

  const leg: TradeLeg = {
    id: r.id,
    tradeRef: t?.reference ?? "-",
    isin: p?.isin ?? "-",
    productName: p?.product_name ?? "-",
    direction,
    tradeDate: t?.trade_date ?? "",
    valueDate: t?.value_date ?? "",
    currency: p?.currency ?? "EUR",
    settlementType,
    notional: settlementType === "percent" ? size : undefined,
    numberOfUnits: settlementType === "units" ? size : undefined,
    clientPrice,
    netAmount,
    // Client name from trades.client_name (the advisor/client entity)
    clientName: t?.client_name ?? "-",
    bookingEntity,
    distributingEntity,
    dealerLegalName: isDistValeur ? "Valeur Securities AG, Switzerland" : "RiverRock Securities SAS, France",
    // Valeur: hardcoded Euroclear SSI. RiverRock: opposite-direction leg's counterparty SSI
    dealerSSI: isDistValeur ? "Euroclear 41420" : dealerSSI,
    counterpartyLegalName: r.counterparty?.legal_name ?? "-",
    counterpartySSI: r.counterparty?.ssi ?? undefined,
    counterpartyId: r.counterparty_id ?? undefined,
    clientId: t?.client_contact?.advisor_id ?? "",
  };

  return NextResponse.json(leg);
}
