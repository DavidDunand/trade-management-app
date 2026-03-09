"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import NewTradeForm from "../components/NewTradeForm"; // ✅ adjust path if your Blotter page is not in the same folder level

type Settlement = "percent" | "units";
type LegStatus = "pending" | "booked";
type ModalMode = "new" | "edit" | "clone";

type TradeRow = {
  id: string;
  trade_date: string | null;
  value_date: string | null;
  transaction_type: string | null;

  // raw DB status (pending/booked/cancelled/archived)
  status: string | null;

  // computed via view
  effective_status?: "pending" | "booked" | "cancelled" | "archived" | null;

  reference: string | null;

  created_at: string | null;
  created_by: { full_name: string } | null;

  booked_at?: string | null;
  booked_by?: { full_name: string } | null;

  cancelled_at: string | null;
  cancelled_by: { full_name: string } | null;

  buy_price: number | null; // Reoffer (Seller price)
  sell_price: number | null; // Client (Buyer price)

  total_size: number | null;

  gross_fees: number | null;
  pnl_trade_ccy: number | null;
  pnl_eur: number | null;

  retro_client: number | null;
  retro_introducer: number | null;
  fee_custodian: number | null;

  // raw inputs (Cut)
  retro_client_input: number | null;
  retro_introducer_input: number | null;
  fee_custodian_input: number | null;

  client_name: string | null;
  introducer_name: string | null;
  sales_name: string | null;
  client_contact: { first_name: string; family_name: string; email: string | null } | null;
  introducer_contact: { first_name: string; family_name: string; email: string | null } | null;

  booking_entity: { legal_name: string } | null;
  distributing_entity: { legal_name: string } | null;

  product: {
    isin: string;
    product_name: string;
    currency: string;
    settlement: Settlement;
    issuer: { legal_name: string } | null;
  } | null;
};

type LegRow = {
  id: string;
  trade_id: string;
  leg: "buy" | "sell"; // UI: buy => Seller, sell => Buyer
  status: LegStatus;
  size: number | null;
  counterparty: { legal_name: string; cp_type: string } | null;
  trade: TradeRow | null;
};

type TradeGroup = {
  trade_id: string;
  trade: TradeRow;
  legs: LegRow[];
};

function cap(s: string | null | undefined) {
  if (!s) return "-";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmt2(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  return n.toFixed(2);
}

function formatSwiss2(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${sign}${withSep}.${decPart}`;
}

function formatDateDDMonYYYY(isoDate: string | null | undefined) {
  if (!isoDate) return "-";
  const y = isoDate.slice(0, 4);
  const m = Number(isoDate.slice(5, 7));
  const d = isoDate.slice(8, 10);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = months[m - 1] ?? "???";
  return `${d}-${mon}-${y}`;
}

function formatDateTimeDDMonYYYY(isoTs: string | null | undefined) {
  if (!isoTs) return "-";
  const dt = new Date(isoTs);
  if (Number.isNaN(dt.getTime())) return isoTs;
  const yyyy = dt.getFullYear();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mon = months[dt.getMonth()] ?? "???";
  const dd = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${dd}-${mon}-${yyyy} ${hh}:${mm}`;
}

function legLabel(leg: "buy" | "sell") {
  return leg === "buy" ? "Seller" : "Buyer";
}

function priceDisplay(settlement: Settlement | undefined, n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  const v = n.toFixed(2);
  return settlement === "percent" ? `${v}%` : v;
}

function tooltipWrap(children: React.ReactNode, content: React.ReactNode) {
  return (
    <span className="relative inline-flex group">
      {children}
      <span className="pointer-events-none absolute z-50 hidden group-hover:block left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap rounded-lg border border-black/10 bg-white px-3 py-2 text-xs text-black shadow-lg">
        {content}
      </span>
    </span>
  );
}

function statusIcon(status: string | null | undefined) {
  const s = (status ?? "").toLowerCase();
  if (s === "pending") return "⏳";
  if (s === "booked") return "✅";
  if (s === "cancelled") return "⛔";
  if (s === "archived") return "📦";
  return "—";
}

function totalRetro(t: TradeRow) {
  return Number(t.retro_client ?? 0) + Number(t.retro_introducer ?? 0) + Number(t.fee_custodian ?? 0);
}

function drawerRow(label: string, value: React.ReactNode) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-black/10">
      <div className="text-sm text-black/60 font-bold">{label}</div>
      <div className="text-sm text-black font-bold text-right break-words">{value}</div>
    </div>
  );
}

type TimeRange = "all" | "year" | "quarter" | "month";

function startDateForRange(range: TimeRange) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = now.getMonth();
  const toIso = (d: Date) => d.toISOString().slice(0, 10);

  if (range === "all") return null;
  if (range === "year") return `${yyyy}-01-01`;
  if (range === "month") {
    const m = String(mm + 1).padStart(2, "0");
    return `${yyyy}-${m}-01`;
  }
  const qStartMonth = Math.floor(mm / 3) * 3;
  const d = new Date(yyyy, qStartMonth, 1);
  return toIso(d);
}

function csvEscape(v: any) {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[,"\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

function toCsv(headers: string[], rows: Record<string, any>[]) {
  const lines = [headers.map(csvEscape).join(","), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(","))];
  return lines.join("\n");
}

function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8;") {
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + content], { type: mime });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildTrail(t: TradeRow) {
  const createdBy = t.created_by?.full_name ?? "-";
  const createdAt = formatDateTimeDDMonYYYY(t.created_at);
  const cancelledAt = t.cancelled_at ? formatDateTimeDDMonYYYY(t.cancelled_at) : "";
  const cancelledBy = t.cancelled_by?.full_name ?? "-";
  const base = `Created by ${createdBy} on ${createdAt}`;
  if (!cancelledAt) return base;
  return `${base} | Cancelled by ${cancelledBy} on ${cancelledAt}`;
}

function exportBlotterCsv(groups: TradeGroup[]) {
  const headers = [
    "Trade date",
    "Value Date",
    "ISIN",
    "Product",
    "Issuer",
    "CCY",
    "Type",
    "Leg",
    "Counterparty",
    "Size",
    "Reoffer Price",
    "Client Price",
    "Gross Fees",
    "P&L (CCY)",
    "P&L (EUR)",
    "Status",
    "Booking Entity",
    "Distribution Entity",
    "Client Name",
    "Introducer Name",
    "Retro Client (amount)",
    "Retro Introducer (amount)",
    "Custodian Fee (amount)",
    "Sales Name",
    "Reference",
    "Trail",
  ];

  const rowsOut: Record<string, any>[] = [];

  for (const g of groups) {
    const t = g.trade;
    const ccy = t.product?.currency ?? "";
    const settlement = t.product?.settlement;

    const retroClient = Number(t.retro_client ?? 0);
    const retroIntro = Number(t.retro_introducer ?? 0);
    const retroCust = Number(t.fee_custodian ?? 0);

    const effStatus = ((t.status === "cancelled" || !!t.cancelled_at) ? "cancelled" : (t.effective_status ?? t.status ?? "")) as string;

    // 1) Trade recap row
    rowsOut.push({
      "Trade date": formatDateDDMonYYYY(t.trade_date),
      "Value Date": formatDateDDMonYYYY(t.value_date),
      ISIN: t.product?.isin ?? "",
      Product: t.product?.product_name ?? "",
      Issuer: t.product?.issuer?.legal_name ?? "",
      CCY: ccy,
      Type: cap(t.transaction_type),
      Leg: "Trade recap",
      Counterparty: "",
      Size: Number(t.total_size ?? 0) || "",
      "Reoffer Price": priceDisplay(settlement, t.buy_price),
      "Client Price": priceDisplay(settlement, t.sell_price),
      "Gross Fees": Number(t.gross_fees ?? 0) || "",
      "P&L (CCY)": Number(t.pnl_trade_ccy ?? 0) || "",
      "P&L (EUR)": Number(t.pnl_eur ?? 0) || "",
      Status: effStatus,
      "Booking Entity": t.booking_entity?.legal_name ?? "",
      "Distribution Entity": t.distributing_entity?.legal_name ?? "",
      "Client Name": t.client_name ?? "",
      "Introducer Name": t.introducer_name ?? "",
      "Retro Client (amount)": Number(retroClient ?? 0) || "",
      "Retro Introducer (amount)": Number(retroIntro ?? 0) || "",
      "Custodian Fee (amount)": Number(retroCust ?? 0) || "",
      "Sales Name": t.sales_name ?? "",
      Reference: t.reference ?? "",
      Trail: buildTrail(t),
    });

    // 2) Leg rows
    for (const r of g.legs) {
      const tradeIsCancelled = effStatus === "cancelled" || (t.status ?? "").toLowerCase() === "cancelled" || !!t.cancelled_at;
      const tradeIsArchived = effStatus === "archived" || (t.status ?? "").toLowerCase() === "archived";
      const legDisplayStatus = tradeIsCancelled ? "cancelled" : tradeIsArchived ? "archived" : r.status;

      rowsOut.push({
        "Trade date": formatDateDDMonYYYY(t.trade_date),
        "Value Date": formatDateDDMonYYYY(t.value_date),
        ISIN: t.product?.isin ?? "",
        Product: t.product?.product_name ?? "",
        Issuer: t.product?.issuer?.legal_name ?? "",
        CCY: ccy,
        Type: cap(t.transaction_type),
        Leg: legLabel(r.leg),
        Counterparty: r.counterparty?.legal_name ?? "",
        Size: "",
        "Reoffer Price": priceDisplay(settlement, t.buy_price),
        "Client Price": priceDisplay(settlement, t.sell_price),
        "Gross Fees": "",
        "P&L (CCY)": "",
        "P&L (EUR)": "",
        Status: legDisplayStatus,
        "Booking Entity": t.booking_entity?.legal_name ?? "",
        "Distribution Entity": t.distributing_entity?.legal_name ?? "",
        "Client Name": t.client_name ?? "",
        "Introducer Name": t.introducer_name ?? "",
        "Retro Client (amount)": "",
        "Retro Introducer (amount)": "",
        "Custodian Fee (amount)": "",
        "Sales Name": t.sales_name ?? "",
        Reference: t.reference ?? "",
        Trail: buildTrail(t),
      });
    }
  }

  const csv = toCsv(headers, rowsOut);
  const stamp = new Date().toISOString().slice(0, 10);
  downloadTextFile(`blotter_export_${stamp}.csv`, csv);
}

function htmlEscape(v: any) {
  const s = v === null || v === undefined ? "" : String(v);
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fileSafe(s: string) {
  return (s || "email")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function downloadTextAsFile(filename: string, content: string, mime = "message/rfc822;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function retroDisplay(
  settlement: Settlement | undefined,
  cut: number | null | undefined,
  amount: number | null | undefined,
  ccy: string
) {
  const cutStr =
    settlement === "percent"
      ? `${fmt2(cut ?? null)}%`
      : `${fmt2(cut ?? null)} ${ccy} per unit`;
  const amtStr = `${formatSwiss2(amount ?? null)} ${ccy}`;
  return `Cut: ${cutStr} | Amount: ${amtStr}`;
}

function investmentAmount(
  settlement: Settlement | undefined,
  size: number | null | undefined,
  clientPrice: number | null | undefined
) {
  const sz = Number(size ?? 0);
  const px = Number(clientPrice ?? 0);
  if (!Number.isFinite(sz) || !Number.isFinite(px)) return null;

  // Best-effort logic:
  // - percent: size * (price/100)
  // - units: size * price
  const v = settlement === "percent" ? sz * (px / 100) : sz * px;
  return Number.isFinite(v) ? v : null;
}

function buildTradeSplitLines(legs: LegRow[]) {
  const sellers = legs.filter((l) => l.leg === "buy");
  const buyers = legs.filter((l) => l.leg === "sell");

  const fmtLeg = (l: LegRow) => {
    const cp = l.counterparty?.legal_name ?? "-";
    const sz = formatSwiss2(l.size);
    return `${cp} (${sz})`;
  };

  const parts: string[] = [];
  if (sellers.length) parts.push(`Seller: ${sellers.map(fmtLeg).join(" | ")}`);
  if (buyers.length) parts.push(`Buyer: ${buyers.map(fmtLeg).join(" | ")}`);
  if (!parts.length) parts.push("-");
  return parts;
}

function normalizedPrices(t: TradeRow) {
  const isUnwind = (t.transaction_type ?? "").toLowerCase() === "unwind";

  if (isUnwind) {
    return {
      reoffer: t.sell_price,
      client: t.buy_price,
    };
  }

  return {
    reoffer: t.buy_price,
    client: t.sell_price,
  };
}

function buildEmlForTrade(args: { trade: TradeRow; legs: LegRow[] }) {
  const { trade: t, legs } = args;

  const isin = t.product?.isin ?? "";
  const type = cap(t.transaction_type);
  const product = t.product?.product_name ?? "";
  const issuer = t.product?.issuer?.legal_name ?? "";
  const ccy = t.product?.currency ?? "";
  const settlement = t.product?.settlement;

  const subject = `Recap ${isin} / ${type} ${product}`.trim();

  // Contacts: not available in current code; keep safe fallbacks.
  // If you later add fields, just replace these.
const clientContactObj = t.client_contact ?? null;
const introducerContactObj = t.introducer_contact ?? null;

const clientContactStr = clientContactObj
  ? `${clientContactObj.first_name ?? ""} ${clientContactObj.family_name ?? ""}`.trim()
  : "-";

const introducerContactStr = introducerContactObj
  ? `${introducerContactObj.first_name ?? ""} ${introducerContactObj.family_name ?? ""}`.trim()
  : "-";

const { reoffer, client } = normalizedPrices(t);

const reofferStr = priceDisplay(settlement, reoffer);
const clientPriceStr = priceDisplay(settlement, client);

  const invAmt = investmentAmount(settlement, t.total_size, t.sell_price);

  const splitLines = buildTradeSplitLines(legs);

  const rows: Array<[string, string]> = [
    ["Sales", t.sales_name ?? "-"],
    ["Booking Entity", t.booking_entity?.legal_name ?? "-"],
    ["Distribution Entity", t.distributing_entity?.legal_name ?? "-"],
    ["Trade Date", formatDateDDMonYYYY(t.trade_date)],
    ["Value Date", formatDateDDMonYYYY(t.value_date)],
    ["Client", t.client_name ?? "-"],
    ["Client Contact", clientContactStr],
    ["Introducer", t.introducer_name ?? "-"],
    ["Introducer Contact", introducerContactStr],
    ["Currency", ccy || "-"],
    ["Trade Direction", type || "-"],
    ["Issuer", issuer || "-"],
    ["ISIN", isin || "-"],
    ["Quotation Type", settlement ?? "-"],
    ["", ""],
    ["Reoffer Price", reofferStr],
    ["Client Retro", retroDisplay(settlement, t.retro_client_input, t.retro_client, ccy)],
    ["Introducer Retro", retroDisplay(settlement, t.retro_introducer_input, t.retro_introducer, ccy)],
    ["Custodian Fee", retroDisplay(settlement, t.fee_custodian_input, t.fee_custodian, ccy)],

  ["P&L (CCY)", retroDisplay(
  settlement,
  // P&L cut calculation (same logic as drawer)
  (Number(t.sell_price ?? 0) - Number(t.buy_price ?? 0))
    - Number(t.retro_client_input ?? 0)
    - Number(t.retro_introducer_input ?? 0)
    - Number(t.fee_custodian_input ?? 0),
  t.pnl_trade_ccy,
  ccy
)],

    ["Client Price", clientPriceStr],
    ["", ""],
    ["Volume", formatSwiss2(t.total_size)],
    ["Investment Amount", invAmt === null ? "-" : `${formatSwiss2(invAmt)} ${ccy}`],
    ["Split", splitLines.join("\n")],
  ];

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${htmlEscape(subject)}</title>
  </head>
  <body style="font-family: Arial, sans-serif; font-size: 12px; color: #111;">
    <table cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; max-width: 820px;">
      ${rows
        .map(([a, b]) => {
          if (!a && !b) {
            return `<tr><td colspan="2" style="border-top: 1px solid #e5e5e5;">&nbsp;</td></tr>`;
          }
          const bHtml =
            a === "Split"
              ? htmlEscape(b).replaceAll("\n", "<br/>")
              : htmlEscape(b);
          return `<tr>
            <td style="width: 240px; border-top: 1px solid #e5e5e5; font-weight: 700; color: #444;">${htmlEscape(a)}</td>
            <td style="border-top: 1px solid #e5e5e5; font-weight: 700; color: #111;">${bHtml}</td>
          </tr>`;
        })
        .join("")}
    </table>
  </body>
</html>`;

  // Minimal RFC822 / EML
  const eml =
    [
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/html; charset="utf-8"`,
      `Content-Transfer-Encoding: 8bit`,
      ``,
      html,
      ``,
    ].join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = fileSafe(`recap_${isin}_${stamp}.eml`);
  return { eml, filename };
}

export default function BlotterPage() {
  const [rows, setRows] = useState<LegRow[]>([]);
  const [loading, setLoading] = useState(false);

  // Edit / Clone modal (uses NewTradeForm as modal)
  const [tradeModalOpen, setTradeModalOpen] = useState(false);
  const [tradeModalMode, setTradeModalMode] = useState<ModalMode>("edit");
  const [tradeModalSourceId, setTradeModalSourceId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "booked" | "cancelled" | "archived">("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  // extra filters
  const [tradeDateFilter, setTradeDateFilter] = useState("");
  const [isinFilter, setIsinFilter] = useState("");
  const [issuerFilter, setIssuerFilter] = useState("");
  const [ccyFilter, setCcyFilter] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [introducerFilter, setIntroducerFilter] = useState("");
  const [salesFilter, setSalesFilter] = useState("");

  const [openTrades, setOpenTrades] = useState<Record<string, boolean>>({});
  const [compactLegRows, setCompactLegRows] = useState(true);

  const [drawerTrade, setDrawerTrade] = useState<TradeRow | null>(null);
  const [drawerEffectiveStatus, setDrawerEffectiveStatus] = useState<"pending" | "booked" | "cancelled" | "archived" | null>(null);

  const [toast, setToast] = useState<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id ?? null;
      setMyUserId(uid);

      if (!uid) {
        setIsAdmin(false);
        return;
      }
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", uid).single();
      setIsAdmin((prof?.role ?? "readonly") === "admin");
    })();
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  }

  async function refreshTradeEffectiveStatus(tradeIds: string[]) {
    if (tradeIds.length === 0) return new Map<string, any>();
    const { data, error } = await supabase
      .from("trades_with_effective_status")
      .select("id,status,effective_status,booked_at,cancelled_at")
      .in("id", tradeIds);

    if (error) throw error;
    const map = new Map<string, any>();
    for (const r of data ?? []) map.set(r.id, r);
    return map;
  }

  const fetchRows = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("trade_legs")
      .select(
        `
        id,
        trade_id,
        leg,
        status,
        size,
        counterparty:counterparty_id(id, legal_name, cp_type),
        trade:trade_id(
          id,
          trade_date,
          value_date,
          transaction_type,
          reference,
          status,
          created_at,
          created_by:created_by(full_name),
          booked_at,
          booked_by:booked_by(full_name),
          cancelled_at,
          cancelled_by:cancelled_by(full_name),
          buy_price,
          sell_price,
          total_size,
          gross_fees,
          pnl_trade_ccy,
          pnl_eur,
          retro_client,
          retro_introducer,
          fee_custodian,
          retro_client_input,
          retro_introducer_input,
          fee_custodian_input,
          client_name,
          introducer_name,
          sales_name,
          client_contact:client_contact_id(first_name, family_name, email),
          introducer_contact:introducer_contact_id(first_name, family_name, email),
          booking_entity:booking_entity_id(legal_name),
          distributing_entity:distributing_entity_id(legal_name),
          product:product_id(
            isin,
            product_name,
            currency,
            settlement,
            issuer:issuer_id(legal_name)
          )
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    const flattened: LegRow[] = (data ?? []).map((r: any) => ({
      id: r.id,
      trade_id: r.trade_id,
      leg: r.leg,
      status: (r.status ?? "pending") as LegStatus,
      size: r.size ?? null,
      counterparty: r.counterparty ?? null,
      trade: r.trade ?? null,
    }));

    // Overlay effective_status from the view
    try {
      const tradeIds = Array.from(new Set(flattened.map((x) => x.trade_id).filter(Boolean)));
      const eff = await refreshTradeEffectiveStatus(tradeIds);
      for (const leg of flattened) {
        const t = leg.trade;
        if (!t) continue;
        const v = eff.get(t.id);
        t.effective_status = v ? (v.effective_status ?? t.status) : ((t.status as any) ?? null);
      }
    } catch {
      // ignore; UI falls back to trades.status
    }

    setRows(flattened);
    setLoading(false);

    setOpenTrades((prev) => {
      const next = { ...prev };
      for (const leg of flattened) {
        const tid = leg.trade?.id;
        if (tid && next[tid] === undefined) next[tid] = false;
      }
      return next;
    });
  };

  useEffect(() => {
    fetchRows();
  }, []);

  async function setTradeStatusToMatchEffective(tradeId: string) {
    const { data, error } = await supabase
      .from("trades_with_effective_status")
      .select("id,status,effective_status")
      .eq("id", tradeId)
      .single();

    if (error || !data) return;

    const eff = (data.effective_status ?? data.status) as any;
    const raw = (data.status ?? "pending") as any;

    if (raw === "cancelled" || raw === "archived") return;

    if (eff !== raw) {
      const patch: any = { status: eff };
      if (eff === "booked") {
        patch.booked_at = new Date().toISOString();
        patch.booked_by = myUserId;
      }
      await supabase.from("trades").update(patch).eq("id", tradeId);
    }
  }

  async function toggleLegStatus(legId: string, current: LegStatus, tradeId: string) {
    if (!isAdmin) {
      showToast("Readonly: only admin can change status.");
      return;
    }

    const anyLeg = rows.find((x) => x.trade?.id === tradeId);
    const t = anyLeg?.trade;

    const rawStatus = (t?.status ?? "").toLowerCase();
    const effStatus = (((t?.effective_status ?? t?.status) ?? "") as string).toLowerCase();

    const locked =
      rawStatus === "cancelled" ||
      rawStatus === "archived" ||
      !!t?.cancelled_at ||
      rawStatus === "booked" ||
      effStatus === "booked";

    if (locked) {
      showToast("Status is locked for booked/cancelled/archived trades.");
      return;
    }

    const next: LegStatus = current === "booked" ? "pending" : "booked";

    const tradeLegs = rows.filter((x) => x.trade_id === tradeId);
    const wouldCompleteAllBooked =
      next === "booked" && tradeLegs.length > 0 && tradeLegs.every((l) => l.status === "booked" || l.id === legId);

    if (wouldCompleteAllBooked) {
      const ok = confirm("You are about to BOOK this trade. This will set ALL legs to BOOKED. Proceed?");
      if (!ok) return;
    }

    const { error } = await supabase.from("trade_legs").update({ status: next }).eq("id", legId);
    if (error) {
      alert(error.message);
      return;
    }

    setRows((prev) => prev.map((x) => (x.id === legId ? { ...x, status: next } : x)));

    await setTradeStatusToMatchEffective(tradeId);

    try {
      const eff = await refreshTradeEffectiveStatus([tradeId]);
      const v = eff.get(tradeId);
      const newEff = (v?.effective_status ?? null) as any;

      if (newEff === "booked") showToast("Trade is now BOOKED (all legs booked).");
      if (newEff === "pending") showToast("Trade is now PENDING (at least one leg pending).");

      setRows((prev) =>
        prev.map((x) => {
          if (x.trade?.id !== tradeId) return x;
          return { ...x, trade: { ...x.trade!, effective_status: newEff } };
        })
      );
    } catch {
      // ignore
    }
  }

  async function bookTradeAllLegs(tradeId: string) {
    if (!isAdmin) {
      showToast("Readonly: only admin can book a trade.");
      return;
    }
    const ok = confirm("You are about to BOOK this trade. This will set ALL legs to BOOKED. Proceed?");
    if (!ok) return;

    const { error } = await supabase.from("trade_legs").update({ status: "booked" }).eq("trade_id", tradeId);
    if (error) return alert(error.message);

    await supabase
      .from("trades")
      .update({ status: "booked", booked_at: new Date().toISOString(), booked_by: myUserId })
      .eq("id", tradeId);

    showToast("Trade booked (all legs set to BOOKED).");
    fetchRows();
  }

  async function loadDrawerEffective(tradeId: string) {
    const { data, error } = await supabase
      .from("trades_with_effective_status")
      .select("effective_status")
      .eq("id", tradeId)
      .single();
    if (error) {
      setDrawerEffectiveStatus(null);
      return;
    }
    setDrawerEffectiveStatus((data?.effective_status ?? null) as any);
  }

  function openDrawer(t: TradeRow) {
    setDrawerTrade(t);
    if ((t.status ?? "").toLowerCase() === "cancelled" || !!t.cancelled_at) {
      setDrawerEffectiveStatus("cancelled");
      return;
    }
    loadDrawerEffective(t.id);
  }

  function openEdit(tradeId: string) {
    setTradeModalMode("edit");
    setTradeModalSourceId(tradeId);
    setTradeModalOpen(true);
  }

  function openClone(tradeId: string) {
    setTradeModalMode("clone");
    setTradeModalSourceId(tradeId);
    setTradeModalOpen(true);
  }

  async function removePendingTrade(tradeId: string) {
    if (!isAdmin) return showToast("Readonly: only admin can remove trades.");
    const ok = confirm("Remove this pending trade permanently? This cannot be undone.");
    if (!ok) return;

    const { error: e1 } = await supabase.from("trade_legs").delete().eq("trade_id", tradeId);
    if (e1) return alert(e1.message);

    const { error: e2 } = await supabase.from("trades").delete().eq("id", tradeId);
    if (e2) return alert(e2.message);

    showToast("Pending trade removed.");
    setDrawerTrade(null);
    fetchRows();
  }

  async function cancelBookedTrade(tradeId: string) {
    if (!isAdmin) return showToast("Readonly: only admin can cancel trades.");
    const ok = confirm("You are about to cancel a trade. Do you wish to proceed?");
    if (!ok) return;

    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from("trades")
      .update({ status: "cancelled", cancelled_at: nowIso, cancelled_by: myUserId })
      .eq("id", tradeId);

    if (error) {
      alert(error.message);
      return;
    }

    const { data: tFresh, error: tErr } = await supabase
      .from("trades")
      .select("id,status,cancelled_at,cancelled_by:cancelled_by(full_name)")
      .eq("id", tradeId)
      .single();

    if (tErr) {
      setRows((prev) =>
        prev.map((x) => {
          if (x.trade?.id !== tradeId) return x;
          const t = x.trade;
          if (!t) return x;
          return {
            ...x,
            trade: { ...t, status: "cancelled", effective_status: "cancelled", cancelled_at: nowIso } as any,
          };
        })
      );
    } else {
      setRows((prev) =>
        prev.map((x) => {
          if (x.trade?.id !== tradeId) return x;
          const t = x.trade;
          if (!t) return x;
          return {
            ...x,
            trade: {
              ...t,
              status: tFresh.status ?? "cancelled",
              effective_status: "cancelled",
              cancelled_at: tFresh.cancelled_at ?? nowIso,
              cancelled_by: (tFresh as any).cancelled_by ?? t.cancelled_by ?? null,
            } as any,
          };
        })
      );
    }

    if (drawerTrade?.id === tradeId) {
      setDrawerTrade((prev) =>
        prev
          ? ({
              ...prev,
              status: "cancelled",
              effective_status: "cancelled",
              cancelled_at: (tFresh as any)?.cancelled_at ?? nowIso,
              cancelled_by: (tFresh as any)?.cancelled_by ?? prev.cancelled_by ?? null,
            } as any)
          : prev
      );
      setDrawerEffectiveStatus("cancelled");
    }

    showToast("Trade cancelled (excluded from stats).");
    fetchRows();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const isinQ = isinFilter.trim().toLowerCase();
    const issuerQ = issuerFilter.trim().toLowerCase();
    const ccyQ = ccyFilter.trim().toLowerCase();
    const clientQ = clientFilter.trim().toLowerCase();
    const introQ = introducerFilter.trim().toLowerCase();
    const salesQ = salesFilter.trim().toLowerCase();

    const startIso = startDateForRange(timeRange);
    const tradeDateExact = tradeDateFilter.trim();

    return rows.filter((r) => {
      const t = r.trade;
      if (!t) return false;

      const effStatus = ((t.status === "cancelled" || !!t.cancelled_at) ? "cancelled" : (t.effective_status ?? t.status ?? "")) as string;

      if (statusFilter !== "all" && effStatus !== statusFilter) return false;
      if (startIso && (t.trade_date ?? "") < startIso) return false;
      if (tradeDateExact && (t.trade_date ?? "") !== tradeDateExact) return false;

      if (isinQ && !(t.product?.isin ?? "").toLowerCase().includes(isinQ)) return false;
      if (issuerQ && !(t.product?.issuer?.legal_name ?? "").toLowerCase().includes(issuerQ)) return false;
      if (ccyQ && !(t.product?.currency ?? "").toLowerCase().includes(ccyQ)) return false;
      if (clientQ && !(t.client_name ?? "").toLowerCase().includes(clientQ)) return false;
      if (introQ && !(t.introducer_name ?? "").toLowerCase().includes(introQ)) return false;
      if (salesQ && !(t.sales_name ?? "").toLowerCase().includes(salesQ)) return false;

      if (!q) return true;

      const hay = [
        t.reference,
        t.transaction_type,
        effStatus,
        t.product?.isin,
        t.product?.product_name,
        t.product?.issuer?.legal_name,
        t.product?.currency,
        r.counterparty?.legal_name,
        legLabel(r.leg),
        t.client_name,
        t.introducer_name,
        t.sales_name,
        t.booking_entity?.legal_name,
        t.distributing_entity?.legal_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [rows, search, statusFilter, timeRange, tradeDateFilter, isinFilter, issuerFilter, ccyFilter, clientFilter, introducerFilter, salesFilter]);

  const grouped: TradeGroup[] = useMemo(() => {
    const map = new Map<string, TradeGroup>();

    for (const r of filtered) {
      const t = r.trade;
      if (!t?.id) continue;

      const g = map.get(t.id);
      if (!g) map.set(t.id, { trade_id: t.id, trade: t, legs: [r] });
      else g.legs.push(r);
    }

    const arr = Array.from(map.values()).map((g) => ({
      ...g,
      legs: [...g.legs].sort((a, b) => (a.leg === b.leg ? 0 : a.leg === "buy" ? -1 : 1)),
    }));

    arr.sort((a, b) => {
      const ad = a.trade.trade_date ?? "";
      const bd = b.trade.trade_date ?? "";
      if (ad !== bd) return ad < bd ? 1 : -1;
      const ac = a.trade.created_at ?? "";
      const bc = b.trade.created_at ?? "";
      if (ac !== bc) return ac < bc ? 1 : -1;
      return 0;
    });

    return arr;
  }, [filtered]);

  const toggleTrade = (tradeId: string) => {
    setOpenTrades((prev) => ({ ...prev, [tradeId]: !prev[tradeId] }));
  };

  const HEADER_BG = "bg-[#002651]";
  const TRADE_BG = "bg-[#DEE7F0]";
  const BUY_BG = "bg-[#002651]/[0.06]";
  const SELL_BG = "bg-white";

  const totals = useMemo(() => {
    let totalPnlEur = 0;
    let totalRetroAll = 0;

    for (const g of grouped) {
      const t = g.trade;
      totalPnlEur += Number(t.pnl_eur ?? 0);
      totalRetroAll += totalRetro(t);
    }

    return {
      totalPnlEur,
      totalRetro: totalRetroAll,
      trades: grouped.length,
      legs: filtered.length,
    };
  }, [grouped, filtered.length]);

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] rounded-xl bg-black text-white px-4 py-2 text-sm font-bold shadow-xl">
          {toast}
        </div>
      )}

      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-black">Blotter</h1>
          <div className="text-sm text-black/60">
            Click the chevron to collapse/expand legs. Double-click a leg status to toggle pending/booked (admin only).
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-xl border border-black/20 px-3 py-2 bg-white text-sm font-bold"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="booked">Booked</option>
            <option value="cancelled">Cancelled</option>
            <option value="archived">Archived</option>
          </select>

          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as any)}
            className="rounded-xl border border-black/20 px-3 py-2 bg-white text-sm font-bold"
          >
            <option value="all">All Time</option>
            <option value="year">Current Year</option>
            <option value="quarter">Current Quarter</option>
            <option value="month">Current Month</option>
          </select>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full max-w-sm rounded-xl border border-black/20 px-4 py-2 text-sm font-bold"
          />

          <button
            onClick={() => exportBlotterCsv(grouped)}
            className="rounded-xl bg-[#002651] text-white px-4 py-2 text-sm font-bold hover:opacity-95"
          >
            Export (CSV)
          </button>

          <button
            onClick={() => setCompactLegRows((v) => !v)}
            className="rounded-xl border border-black/20 px-4 py-2 text-sm font-bold hover:bg-black/5"
            title="Toggle leg row compact view"
          >
            {compactLegRows ? "Export View" : "Clean View"}
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="rounded-2xl border border-black/10 p-4 bg-white">
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          <input
            type="date"
            value={tradeDateFilter}
            onChange={(e) => setTradeDateFilter(e.target.value)}
            className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
            title="Filter by Trade Date (exact)"
          />
          <input value={isinFilter} onChange={(e) => setIsinFilter(e.target.value)} placeholder="ISIN" className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold" />
          <input value={issuerFilter} onChange={(e) => setIssuerFilter(e.target.value)} placeholder="Issuer" className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold" />
          <input value={ccyFilter} onChange={(e) => setCcyFilter(e.target.value)} placeholder="CCY" className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold" />
          <input value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} placeholder="Client" className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold" />
          <input value={introducerFilter} onChange={(e) => setIntroducerFilter(e.target.value)} placeholder="Introducer" className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold" />
          <input value={salesFilter} onChange={(e) => setSalesFilter(e.target.value)} placeholder="Sales" className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold" />
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 overflow-hidden relative">
        <div className="px-4 py-2 bg-black/5 text-sm text-black/70 flex items-center justify-between font-bold">
          <div>{loading ? "Loading…" : `Total P&L (EUR): ${formatSwiss2(totals.totalPnlEur)} • ${totals.trades} trade(s)`}</div>
        </div>

        <div className="overflow-auto">
         <table className="min-w-[1750px] w-full text-xs font-normal">
            <thead className={`${HEADER_BG} sticky top-0 z-10`}>
              <tr className="text-left text-white">
                <th className="p-3">Trade Date</th>
                <th className="p-3">Value Date</th>
                <th className="p-3">ISIN</th>
                <th className="p-3">Product</th>
                <th className="p-3">Issuer</th>
                <th className="p-3">CCY</th>
                <th className="p-3">Type</th>
                <th className="p-3">Leg</th>
                <th className="p-3">Counterparty</th>
                <th className="p-3">Size</th>
                <th className="p-3">Reoffer Price</th>
                <th className="p-3">Client Price</th>
                <th className="p-3">Total Retro</th>
                <th className="p-3">P&amp;L (CCY)</th>
                <th className="p-3">P&amp;L (EUR)</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>

            <tbody>
              {grouped.map((g) => {
                const t = g.trade;
                const isOpen = !!openTrades[g.trade_id];
                const ccy = t.product?.currency ?? "";
                const settlement = t.product?.settlement;

                const retroClient = Number(t.retro_client ?? 0);
                const retroIntro = Number(t.retro_introducer ?? 0);
                const retroCust = Number(t.fee_custodian ?? 0);
                const totRetro = retroClient + retroIntro + retroCust;

                const effStatus = ((t.status === "cancelled" || !!t.cancelled_at) ? "cancelled" : (t.effective_status ?? t.status)) as any;
                const statusSym = statusIcon(effStatus);
                const statusText = cap(effStatus);

                return (
                  <React.Fragment key={g.trade_id}>
                    {/* Trade recap row */}
                    <tr className={`border-t border-black/10 ${TRADE_BG}`}>
                      <td className="p-3 cursor-pointer select-none" onClick={() => toggleTrade(g.trade_id)} title="Toggle legs">
                        <span className="mr-2 inline-block w-4 text-center">{isOpen ? "▾" : "▸"}</span>
                        {formatDateDDMonYYYY(t.trade_date)}
                      </td>
                      <td className="p-3">{formatDateDDMonYYYY(t.value_date)}</td>
                      <td className="p-3 font-mono select-text">{t.product?.isin ?? "-"}</td>
                      <td className="p-3 font-bold">{t.product?.product_name ?? "-"}</td>
                      <td className="p-3">{t.product?.issuer?.legal_name ?? "-"}</td>
                      <td className="p-3 font-bold">{ccy || "-"}</td>
                      <td className="p-3">{cap(t.transaction_type)}</td>

                      <td className="p-3 text-black/70" colSpan={2}>
                        Trade recap — legs below
                      </td>

                      <td className="p-3 font-bold">{formatSwiss2(t.total_size)}</td>
{(() => {
  const isUnwind = (t.transaction_type ?? "").toLowerCase() === "unwind";

  const reoffer = isUnwind ? t.sell_price : t.buy_price;
  const client = isUnwind ? t.buy_price : t.sell_price;

  return (
    <>
      <td className="p-3">{priceDisplay(settlement, reoffer)}</td>
      <td className="p-3">{priceDisplay(settlement, client)}</td>
    </>
  );
})()}

                      <td className="p-3">
                        {tooltipWrap(
                          <span>
                            {formatSwiss2(totRetro)} {ccy}
                          </span>,
                          <div className="space-y-1">
                            <div>
                              Client: {formatSwiss2(retroClient)} {ccy}
                            </div>
                            <div>
                              Introducer: {formatSwiss2(retroIntro)} {ccy}
                            </div>
                            <div>
                              Custodian: {formatSwiss2(retroCust)} {ccy}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="p-3">
                        {formatSwiss2(t.pnl_trade_ccy)} {ccy}
                      </td>
                      <td className="p-3 font-bold text-green-700">{formatSwiss2(t.pnl_eur)} EUR</td>

                      <td
                        className="p-3"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          if (effStatus === "pending") bookTradeAllLegs(g.trade_id);
                        }}
                        title={isAdmin && effStatus === "pending" ? "Double-click to book trade (books all legs)" : undefined}
                      >
                        <div className="flex items-center gap-3">
                          {tooltipWrap(<span className="text-base leading-none">{statusSym}</span>, <span>{statusText}</span>)}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDrawer(t);
                            }}
                            className="rounded-lg border border-black/20 px-3 py-1 text-xs hover:bg-black/5"
                          >
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Legs */}
                    {isOpen &&
                      g.legs.map((r) => {
                        const bg = r.leg === "buy" ? BUY_BG : SELL_BG;

                        return (
                          <tr key={r.id} className={`border-t border-black/10 ${bg}`}>
                            <td className="p-3 text-black/60">{compactLegRows ? "" : formatDateDDMonYYYY(t.trade_date)}</td>
                            <td className="p-3 text-black/60">{compactLegRows ? "" : formatDateDDMonYYYY(t.value_date)}</td>
                            <td className="p-3 font-mono text-black/70 select-text">{compactLegRows ? "" : (t.product?.isin ?? "-")}</td>
                            <td className="p-3 text-black/70">{compactLegRows ? "" : (t.product?.product_name ?? "-")}</td>
                            <td className="p-3 text-black/70">{compactLegRows ? "" : (t.product?.issuer?.legal_name ?? "-")}</td>
                            <td className="p-3 text-black/70">{compactLegRows ? "" : (ccy || "-")}</td>
                            <td className="p-3 text-black/70">{compactLegRows ? "" : cap(t.transaction_type)}</td>

                            <td className="p-3">{legLabel(r.leg)}</td>
                            <td className="p-3">
                              {r.counterparty?.legal_name ?? "-"}
                              {r.counterparty?.cp_type ? <span className="text-black/45"> • {r.counterparty.cp_type}</span> : null}
                            </td>

                            <td className="p-3">{formatSwiss2(r.size)}</td>

{(() => {
  const isUnwind = (t.transaction_type ?? "").toLowerCase() === "unwind";

  const reoffer = isUnwind ? t.sell_price : t.buy_price;
  const client = isUnwind ? t.buy_price : t.sell_price;

  return (
    <>
      <td className="p-3 text-black/60">{priceDisplay(settlement, reoffer)}</td>
      <td className="p-3 text-black/60">{priceDisplay(settlement, client)}</td>
    </>
  );
})()}

                            <td className="p-3 text-black/60"></td>
                            <td className="p-3 text-black/60"></td>
                            <td className="p-3 text-black/60"></td>

                            <td
                              className="p-3 text-black/60"
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                if (
                                  effStatus === "cancelled" ||
                                  effStatus === "archived" ||
                                  (t.status ?? "").toLowerCase() === "cancelled" ||
                                  !!t.cancelled_at
                                ) {
                                  return;
                                }
                                toggleLegStatus(r.id, r.status, g.trade_id);
                              }}
                              title={
                                isAdmin &&
                                !(effStatus === "cancelled" || effStatus === "archived" || (t.status ?? "").toLowerCase() === "cancelled" || !!t.cancelled_at)
                                  ? "Double-click to toggle leg status pending/booked"
                                  : undefined
                              }
                            >
                              {(() => {
                                const tradeIsCancelled =
                                  effStatus === "cancelled" || (t.status ?? "").toLowerCase() === "cancelled" || !!t.cancelled_at;
                                const tradeIsArchived = effStatus === "archived" || (t.status ?? "").toLowerCase() === "archived";

                                const legDisplayStatus: string = tradeIsCancelled ? "cancelled" : tradeIsArchived ? "archived" : r.status;

                                return (
                                  <span className="inline-flex items-center gap-2 rounded-lg border border-black/10 px-2 py-1 bg-white">
                                    <span className="text-base leading-none">{statusIcon(legDisplayStatus)}</span>
                                    <span className="text-xs">{legDisplayStatus}</span>
                                  </span>
                                );
                              })()}
                            </td>
                          </tr>
                        );
                      })}

                    {/* Separator */}
                    <tr>
                      <td colSpan={16} className="h-2 border-t border-black/10 bg-white"></td>
                    </tr>
                  </React.Fragment>
                );
              })}

              {grouped.length === 0 && (
                <tr>
                  <td colSpan={16} className="p-6 text-black/60 font-bold">
                    No rows yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Drawer */}
        {drawerTrade && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerTrade(null)} />
            <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl border-l border-black/10 flex flex-col">
              <div className="px-5 py-4 bg-[#002651] text-white flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">Trade Details</div>
                  <div className="text-xs text-white/80">
                    {drawerTrade.product?.isin ?? "-"} • {drawerTrade.product?.product_name ?? "-"}
                  </div>
                  <div className="text-[11px] text-white/70 mt-1">
                    Status: {cap(drawerEffectiveStatus ?? drawerTrade.effective_status ?? drawerTrade.status)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setDrawerTrade(null)} className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15">
                    Close
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="px-5 py-3 border-b border-black/10 bg-white flex items-center gap-2">
<button
  onClick={() => {
    const legs = rows.filter((x) => x.trade?.id === drawerTrade.id);
    const { eml, filename } = buildEmlForTrade({ trade: drawerTrade, legs });
    downloadTextAsFile(filename, eml, 'message/rfc822;charset=utf-8;');
    showToast("Email recap downloaded (.eml).");
  }}
  className="rounded-lg border border-black/20 px-3 py-1 text-sm font-bold hover:bg-black/5"
  title="Download recap email (.eml)"
  aria-label="Download recap email"
  type="button"
>
  <span className="text-base leading-none">📧</span>
</button>


{isAdmin && (drawerEffectiveStatus ?? drawerTrade.effective_status ?? drawerTrade.status) === "pending" && (
  <>
    <button onClick={() => openEdit(drawerTrade.id)} className="rounded-lg border border-black/20 px-3 py-1 text-sm font-bold hover:bg-black/5">
      Edit
    </button>

    <button onClick={() => openClone(drawerTrade.id)} className="rounded-lg border border-black/20 px-3 py-1 text-sm font-bold hover:bg-black/5">
      Clone
    </button>

    <button onClick={() => removePendingTrade(drawerTrade.id)} className="rounded-lg border border-red-500/40 text-red-700 px-3 py-1 text-sm font-bold hover:bg-red-50">
      Remove
    </button>
  </>
)}

                {isAdmin && (drawerEffectiveStatus ?? drawerTrade.effective_status ?? drawerTrade.status) === "booked" && (
                  <>
                    <button onClick={() => openClone(drawerTrade.id)} className="rounded-lg border border-black/20 px-3 py-1 text-sm font-bold hover:bg-black/5">
                      Clone
                    </button>
                    <button onClick={() => cancelBookedTrade(drawerTrade.id)} className="rounded-lg border border-red-500/40 text-red-700 px-3 py-1 text-sm font-bold hover:bg-red-50">
                      Cancel
                    </button>
                  </>
                )}

                {!isAdmin && <div className="text-sm text-black/60 font-bold">Readonly</div>}
              </div>

              <div className="p-5 overflow-y-auto">
                {drawerRow("Reference", <span className="font-mono">{drawerTrade.reference ?? "-"}</span>)}
                {drawerRow("Booking Entity", drawerTrade.booking_entity?.legal_name ?? "-")}
                {drawerRow("Distribution Entity", drawerTrade.distributing_entity?.legal_name ?? "-")}

                {drawerRow("Client Name", drawerTrade.client_name ?? "-")}
                {drawerRow(
  "Gross Fees",
  <span className="text-blue-800">
    {formatSwiss2(drawerTrade.gross_fees)} {drawerTrade.product?.currency ?? ""}
  </span>
)}

                {drawerRow(
                  "Retro Client",
                  <div className="space-y-1">
<div>
  Cut:{" "}
  <span className="text-red-700">
    {drawerTrade.product?.settlement === "percent"
      ? `${fmt2(drawerTrade.retro_client_input)}%`
      : `${fmt2(drawerTrade.retro_client_input)} ${drawerTrade.product?.currency ?? ""} per unit`}
  </span>
</div>
<div>
  Amount:{" "}
  <span className="text-red-700">
    {formatSwiss2(drawerTrade.retro_client)} {drawerTrade.product?.currency ?? ""}
  </span>
</div>
                  </div>
                )}

                {drawerRow("Introducer Name", drawerTrade.introducer_name ?? "-")}
                {drawerRow(
                  "Retro Introducer",
                  <div className="space-y-1">
<div>
  Cut:{" "}
  <span className="text-red-700">
    {drawerTrade.product?.settlement === "percent"
      ? `${fmt2(drawerTrade.retro_introducer_input)}%`
      : `${fmt2(drawerTrade.retro_introducer_input)} ${drawerTrade.product?.currency ?? ""} per unit`}
  </span>
</div>
<div>
  Amount:{" "}
  <span className="text-red-700">
    {formatSwiss2(drawerTrade.retro_introducer)} {drawerTrade.product?.currency ?? ""}
  </span>
</div>
                  </div>
                )}

                {drawerRow(
                  "Custodian Fee",
                  <div className="space-y-1">
<div>
  Cut:{" "}
  <span className="text-red-700">
    {drawerTrade.product?.settlement === "percent"
      ? `${fmt2(drawerTrade.fee_custodian_input)}%`
      : `${fmt2(drawerTrade.fee_custodian_input)} ${drawerTrade.product?.currency ?? ""} per unit`}
  </span>
</div>
<div>
  Amount:{" "}
  <span className="text-red-700">
    {formatSwiss2(drawerTrade.fee_custodian)} {drawerTrade.product?.currency ?? ""}
  </span>
</div>
                  </div>
                )}

                {drawerRow(
                  "P&L (CCY)",
                  (() => {
                    const settlement = drawerTrade.product?.settlement;
                    const ccy = drawerTrade.product?.currency ?? "";
                    const buy = drawerTrade.buy_price;
                    const sell = drawerTrade.sell_price;

                    if (buy === null || buy === undefined || sell === null || sell === undefined) {
                      return (
                        <div className="space-y-1">
<div>Cut: -</div>
<div>
  Amount:{" "}
  <span className="text-green-700">
    {formatSwiss2(drawerTrade.pnl_trade_ccy)} {ccy}
  </span>
</div>
                        </div>
                      );
                    }

                    const pnlCut =
                      (Number(sell) - Number(buy)) -
                      Number(drawerTrade.retro_client_input ?? 0) -
                      Number(drawerTrade.retro_introducer_input ?? 0) -
                      Number(drawerTrade.fee_custodian_input ?? 0);

                    return (
                      <div className="space-y-1">
<div>
  Cut:{" "}
  <span className="text-green-700">
    {settlement === "percent" ? `${fmt2(pnlCut)}%` : `${fmt2(pnlCut)} ${ccy} per unit`}
  </span>
</div>
<div>
  Amount:{" "}
  <span className="text-green-700">
    {formatSwiss2(drawerTrade.pnl_trade_ccy)} {ccy}
  </span>
</div>
                      </div>
                    );
                  })()
                )}

                {drawerRow("Sales Name", drawerTrade.sales_name ?? "-")}

                {drawerRow(
                  "Trail",
                  (() => {
                    const createdBy = drawerTrade.created_by?.full_name ?? "-";
                    const createdAt = formatDateTimeDDMonYYYY(drawerTrade.created_at);
                    const cancelledAt = drawerTrade.cancelled_at ? formatDateTimeDDMonYYYY(drawerTrade.cancelled_at) : null;
                    const cancelledBy = drawerTrade.cancelled_by?.full_name ?? "-";
                    return (
                      <div className="space-y-1">
                        <div>
                          Created by {createdBy} on {createdAt}
                        </div>
                        {cancelledAt ? <div>Cancelled by {cancelledBy} on {cancelledAt}</div> : null}
                      </div>
                    );
                  })()
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ✅ Edit/Clone modal now uses the shared NewTradeForm component */}
      {tradeModalOpen && (
        <NewTradeForm
          mode={tradeModalMode}
          sourceTradeId={tradeModalSourceId}
          variant="modal"
          onCancel={() => setTradeModalOpen(false)}
          onSaved={() => {
            setTradeModalOpen(false);
            fetchRows();
          }}
        />
      )}
    </div>
  );
}