export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client (SERVICE ROLE ONLY, never expose to browser)
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) throw new Error("Missing env: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing env: SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function suffixFromIndex(i: number) {
  // 0->A, 1->B, ... 25->Z, 26->AA
  let s = "";
  i += 1;
  while (i > 0) {
    const r = (i - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

function yyyymmdd(d: string) {
  // d = 'YYYY-MM-DD'
  return d.replaceAll("-", "");
}

function formatBR(dateYYYYMMDD: string) {
  // 'YYYY-MM-DD' -> 'dd/mm/yyyy'
  const [y, m, d] = dateYYYYMMDD.split("-");
  return `${d}/${m}/${y}`;
}

function hhmmFromTimestamptzUtc(ts: string) {
  // ts is ISO string from Supabase, e.g. '2026-02-26T17:02:13.123+00:00'
  const dt = new Date(ts);
  const hh = String(dt.getUTCHours()).padStart(2, "0");
  const mm = String(dt.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatAJ(tradeDateYYYYMMDD: string, hhmm: string) {
  return `${tradeDateYYYYMMDD}T${hhmm}:00.000000Z`;
}

type Leg = {
  id: string;
  leg: string; // enum in DB; expected values like 'buyer'/'seller'
  size: number;
  price: number;
  counterparty: { id: string; legal_name: string; lei: string | null; country_code: string };
};

// trade_legs.leg is from RiverRock perspective (buy/sell), MiFIR needs counterparty buyer/seller => inverted mapping

function normalizeSide(v: string) {
  const x = (v || "").toLowerCase();

  if (x === "sell") return "buyer";   // we sell => counterparty buys
  if (x === "buy") return "seller";   // we buy  => counterparty sells

  throw new Error(`Unexpected leg value: ${v}`);
}

function expandPairs(legs: Leg[]) {
  const buyers = legs.filter((l) => normalizeSide(l.leg) === "buyer");
  const sellers = legs.filter((l) => normalizeSide(l.leg) === "seller");

  if (buyers.length === 1 && sellers.length === 1) {
    return [{ buyer: buyers[0], seller: sellers[0], size: Number(buyers[0].size) }];
  }
  if (buyers.length > 1 && sellers.length === 1) {
    return buyers.map((b) => ({ buyer: b, seller: sellers[0], size: Number(b.size) }));
  }
  if (sellers.length > 1 && buyers.length === 1) {
    return sellers.map((s) => ({ buyer: buyers[0], seller: s, size: Number(s.size) }));
  }
  throw new Error(
    `Unsupported leg structure (need exactly 1 leg on one side). Buyers=${buyers.length}, Sellers=${sellers.length}`
  );
}

export async function POST(req: NextRequest) {
  try {
  const body = (await req.json()) as { tradeIds: string[] };
  const tradeIds = body.tradeIds?.filter(Boolean) ?? [];
  if (!tradeIds.length) {
    return NextResponse.json({ error: "tradeIds required" }, { status: 400 });
    
  }

  // Fetch trades with legs + product + counterparties
  const { data: trades, error } = await supabase
    .from("trades")
    .select(
      `
      id,
      reference,
      trade_date,
      booking_timestamp,
      reportable,
      buy_price,
      sell_price,
      product:products(id, isin, currency, maturity_date, product_name, settlement),
      legs:trade_legs(
        id,
        leg,
        size,
        price,
        counterparty:counterparties(id, legal_name, lei, country_code)
      )
    `
    )
    .in("id", tradeIds);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!trades?.length) return NextResponse.json({ error: "No trades found" }, { status: 404 });

  // Validate all trades same trade_date for a single file grouping by date (your UI groups by date)
  // If user batches across dates, you can either reject or split files. Here: reject.
  const tradeDate = trades[0].trade_date as string;
  const mixedDate = trades.some((t: any) => t.trade_date !== tradeDate);
  if (mixedDate) {
    return NextResponse.json({ error: "Batch must contain trades from the same trade_date" }, { status: 400 });
  }

  // Build filename: RiverRock.MiFIR._YYYYMMDD_<firstRef>-<lastRef>.xlsx
  const refs = trades
    .map((t: any) => (t.reference ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const firstRef = refs[0] ?? "NOREF";
  const lastRef = refs[refs.length - 1] ?? firstRef;

  const fileName =
    refs.length === 1
      ? `RiverRock.MiFIR._${yyyymmdd(tradeDate)}_${firstRef}.xlsx`
      : `RiverRock.MiFIR._${yyyymmdd(tradeDate)}_${firstRef}-${lastRef}.xlsx`;

  // Load template from repo
  const templatePath = path.join(
    process.cwd(),
    "app",
    "(protected)",
    "transaction-reporting",
    "RiverRock.MiFIR.template.xlsx"
  );
  const templateBuf = await fs.readFile(templatePath);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuf as any);
  const ws = wb.worksheets[0];
  if (!ws) return NextResponse.json({ error: "Template worksheet missing" }, { status: 500 });

  // Write rows starting row 2
  let rowIdx = 2;

  for (const t of trades as any[]) {
    if (!t.reportable) continue;

    // Hard validation for required fields
    if (!t.reference) throw new Error(`Trade ${t.id} missing reference`);
    if (!t.trade_date) throw new Error(`Trade ${t.reference} missing trade_date`);
    if (!t.booking_timestamp) throw new Error(`Trade ${t.reference} missing booking_timestamp`);
    if (!t.product?.isin) throw new Error(`Trade ${t.reference} missing product ISIN`);
    if (!t.product?.currency) throw new Error(`Trade ${t.reference} missing product currency`);
    const maturity = t.product?.maturity_date ?? null;
    if (!maturity) throw new Error(`Trade ${t.reference} missing product maturity_date`);

    const legs: Leg[] = (t.legs ?? []).map((l: any) => ({
      ...l,
      size: Number(l.size),
      price: Number(l.price),
    }));

    if (legs.length < 2) throw new Error(`Trade ${t.reference} must have at least 2 legs`);

    const pairs = expandPairs(legs);

    const hhmm = hhmmFromTimestamptzUtc(t.booking_timestamp);

    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      const suffix = suffixFromIndex(i);

      const buyer = p.buyer.counterparty;
      const seller = p.seller.counterparty;

      if (!buyer?.lei) throw new Error(`Trade ${t.reference}: buyer ${buyer?.legal_name} missing LEI`);
      if (!buyer?.country_code) throw new Error(`Trade ${t.reference}: buyer ${buyer?.legal_name} missing country_code`);
      if (!seller?.lei) throw new Error(`Trade ${t.reference}: seller ${seller?.legal_name} missing LEI`);

      const size = Number(p.size);

      // Price rule:
const tx = String(t.transaction_type ?? "").toLowerCase();

const clientPrice =
  tx.includes("unwind")
    ? Number(t.buy_price ?? 0)
    : Number(t.sell_price ?? 0);

if (!Number.isFinite(clientPrice) || clientPrice === 0) {
  throw new Error(`Trade ${t.reference}: missing client price (buy_price/sell_price) for tx_type=${t.transaction_type}`);
}

      // ---- Static columns ----
      ws.getCell(`A${rowIdx}`).value = "NEWT";
      ws.getCell(`D${rowIdx}`).value = "2138002S2THVONGPWT74";
      ws.getCell(`E${rowIdx}`).value = "2138002S2THVONGPWT74";
      ws.getCell(`F${rowIdx}`).value = true;
      ws.getCell(`G${rowIdx}`).value = "L";
      ws.getCell(`T${rowIdx}`).value = "L";
      ws.getCell(`AG${rowIdx}`).value = true;
      ws.getCell(`AK${rowIdx}`).value = "AOTC";
      ws.getCell(`AM${rowIdx}`).value = "NominalValue";
      ws.getCell(`AQ${rowIdx}`).value = "Pctg";
      ws.getCell(`AT${rowIdx}`).value = "XOFF";
      ws.getCell(`AY${rowIdx}`).value = "FinInstrm.Id";
      ws.getCell(`BF${rowIdx}`).value = 1;
      ws.getCell(`BT${rowIdx}`).value = "CASH";
      ws.getCell(`BY${rowIdx}`).value = "N";
      ws.getCell(`BZ${rowIdx}`).value = "CONCAT";
      ws.getCell(`CA${rowIdx}`).value = "FR19770707MIKAELMALL";
      ws.getCell(`CB${rowIdx}`).value = "FR";
      ws.getCell(`CG${rowIdx}`).value = false;

      // ---- Dynamic columns ----
      ws.getCell(`B${rowIdx}`).value = `${t.reference}${suffix}`;
      ws.getCell(`I${rowIdx}`).value = buyer.lei;
      ws.getCell(`J${rowIdx}`).value = buyer.country_code;

      ws.getCell(`V${rowIdx}`).value = seller.lei;

      ws.getCell(`AJ${rowIdx}`).value = formatAJ(t.trade_date, hhmm);

      ws.getCell(`AL${rowIdx}`).value = size;
      ws.getCell(`AN${rowIdx}`).value = t.product.currency;

      ws.getCell(`AP${rowIdx}`).value = clientPrice;
      const netAmount =
  t.product?.settlement === "percent"
    ? size * (clientPrice / 100)
    : size * clientPrice;

ws.getCell(`AS${rowIdx}`).value = netAmount;

      ws.getCell(`AZ${rowIdx}`).value = t.product.isin;
      ws.getCell(`BR${rowIdx}`).value = formatBR(maturity);

      rowIdx++;
    }
  }

  // Persist report metadata (for status pills + “batched” visualization)
  const { data: reportRow, error: repErr } = await supabase
    .from("mifid_reports")
    .insert([
      {
        trade_date: tradeDate,
        file_name: fileName,
        batch: tradeIds.length > 1,
      },
    ])
    .select("id")
    .single();

  if (!repErr && reportRow?.id) {
    await supabase.from("mifid_report_trades").insert(
      tradeIds.map((id) => ({
        report_id: reportRow.id,
        trade_id: id,
      }))
    );
await supabase.rpc("increment_mifid_download", {
  report_id_input: reportRow.id,
});
  }

  const out = await wb.xlsx.writeBuffer();
  return new NextResponse(out, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
  } catch (e: any) {
    console.error("MiFID report generation failed:", e);
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}