export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { TradeLeg } from "@/app/(protected)/trade-tickets/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
        booking_entity:booking_entity_id(legal_name, entity_type, ssi),
        distributing_entity:distributing_entity_id(id, legal_name, entity_type, ssi, short_name),
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
  const bookingEntity: string = t?.booking_entity?.legal_name ?? "-";
  const distributingEntity: string = t?.distributing_entity?.legal_name ?? "-";
  const distributingEntityType: string = t?.distributing_entity?.entity_type ?? "other";
  const isDistValeur = distributingEntityType === "valeur";
  const direction: "buy" | "sell" = r.leg === "buy" ? "buy" : "sell";
  const clientPrice: number | undefined =
    direction === "sell" ? (t?.sell_price ?? undefined) : (t?.buy_price ?? undefined);
  const size: number = r.size ?? 0;
  const settlementType: "percent" | "units" = p?.settlement ?? "percent";
  const netAmount = computeNetAmount(settlementType, size, clientPrice ?? 0);

  // Resolve clientId: prefer the contact's advisor_id, fall back to advisor lookup by client_name.
  // Without this, trades with no client_contact_id set would have clientId="" and Step3
  // would find no contacts even if the advisor has contacts in the DB.
  let clientId: string = t?.client_contact?.advisor_id ?? "";
  if (!clientId && t?.client_name) {
    const { data: advisorRow } = await supabase
      .from("advisors")
      .select("id")
      .eq("legal_name", t.client_name)
      .maybeSingle();
    clientId = (advisorRow as any)?.id ?? "";
  }

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

  // Fetch dealer contacts from group_entity_contacts
  const { data: entityContactRows } = await supabase
    .from("group_entity_contacts")
    .select("email")
    .eq("group_entity_id", t?.distributing_entity?.id ?? "")
    .not("email", "is", null);
  const dealerContacts = (entityContactRows ?? [])
    .map((c: any) => c.email as string)
    .filter(Boolean)
    .join(" | ");

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
    dealerLegalName: t?.distributing_entity?.legal_name ?? "-",
    // Valeur: SSI from group_entities.ssi (fallback "Euroclear 41420"). RiverRock: opposite-direction leg's counterparty SSI
    dealerSSI: isDistValeur ? (t?.distributing_entity?.ssi ?? "Euroclear 41420") : dealerSSI,
    counterpartyLegalName: r.counterparty?.legal_name ?? "-",
    counterpartySSI: r.counterparty?.ssi ?? undefined,
    counterpartyId: r.counterparty_id ?? undefined,
    clientId,
    distributingEntityType,
    dealerSsi: t?.distributing_entity?.ssi ?? undefined,
    dealerContacts: dealerContacts || undefined,
    dealerShortName: t?.distributing_entity?.short_name ?? undefined,
  };

  return NextResponse.json(leg);
}
