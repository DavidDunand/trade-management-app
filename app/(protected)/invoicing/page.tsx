"use client";
export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { CheckCircle, Clock, FileText } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Settlement = "percent" | "units";

type TradeRow = {
  id: string;
  trade_date: string | null;
  value_date: string | null;
  reference: string | null;
  status: string | null;
  total_size: number | null;
  pnl_trade_ccy: number | null;
  retro_client: number | null;
  retro_introducer: number | null;
  retro_client_input: number | null;
  retro_introducer_input: number | null;
  client_name: string | null;
  introducer_name: string | null;
  booking_entity: { legal_name: string } | null;
  product: {
    isin: string;
    product_name: string;
    currency: string;
    settlement: Settlement;
    issuer: { legal_name: string } | null;
  } | null;
};

type InvoiceRecord = {
  id: string;
  trade_id: string;
  downloaded_at: string | null;
  payment_status: "pending" | "paid";
  created_at: string;
};

type RetroPaymentRecord = {
  id: string;
  trade_id: string;
  payment_status: RetroStatus;
  created_at: string;
};

type RetroStatus =
  | "invoice_not_received"
  | "invoice_received"
  | "invoice_pending_amendment"
  | "payment_approved";

// ─── Constants ────────────────────────────────────────────────────────────────

const BOOKING_ENTITY = "RiverRock Securities SAS, France";

const RETRO_STATUS_OPTIONS: {
  value: RetroStatus;
  label: string;
  color: string;
  selectColor: string;
}[] = [
  {
    value: "invoice_not_received",
    label: "Invoice not received",
    color: "bg-red-100 text-red-700",
    selectColor: "bg-red-50 border-red-300 text-red-700",
  },
  {
    value: "invoice_received",
    label: "Invoice received",
    color: "bg-blue-100 text-blue-700",
    selectColor: "bg-blue-50 border-blue-300 text-blue-700",
  },
  {
    value: "invoice_pending_amendment",
    label: "Invoice pending amendment",
    color: "bg-amber-100 text-amber-700",
    selectColor: "bg-amber-50 border-amber-300 text-amber-700",
  },
  {
    value: "payment_approved",
    label: "Payment approved",
    color: "bg-emerald-100 text-emerald-700",
    selectColor: "bg-emerald-50 border-emerald-300 text-emerald-700",
  },
];

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  const d = iso.slice(8, 10);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d}-${months[m - 1] ?? "???"}-${y}`;
}

function formatNumber(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const [int, dec] = abs.toFixed(2).split(".");
  return `${sign}${int.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}${dec ? `.${dec}` : ""}`;
}

function fmt2(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function he(v: unknown) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

// ─── Invoice PDF generator ────────────────────────────────────────────────────

function generateInvoicePdf(trade: TradeRow) {
  const isin = trade.product?.isin ?? "—";
  const product = trade.product?.product_name ?? "—";
  const issuer = trade.product?.issuer?.legal_name ?? "—";
  const ccy = trade.product?.currency ?? "—";
  const ref = trade.reference ?? "—";
  const tradeDate = formatDate(trade.trade_date);
  const valueDate = formatDate(trade.value_date);
  const grossFees = formatNumber(trade.pnl_trade_ccy);
  const size = formatNumber(trade.total_size);
  const today = formatDate(new Date().toISOString().slice(0, 10));
  const invoiceNumber = `INV-${ref}-${new Date().getFullYear()}`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Invoice ${he(invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; padding: 48px; background: #fff; }

    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px; }
    .company-name { font-size: 20px; font-weight: 700; color: #002651; }
    .company-sub { font-size: 10px; color: #888; margin-top: 6px; line-height: 1.6; }

    .invoice-title h1 { font-size: 32px; font-weight: 700; color: #002651; text-align: right; }
    .invoice-meta { text-align: right; margin-top: 6px; font-size: 11px; color: #555; line-height: 1.8; }

    .divider { border: none; border-top: 2px solid #002651; margin: 24px 0; }

    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-bottom: 32px; }
    .party-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 8px; }
    .party-name { font-size: 13px; font-weight: 700; color: #111; }
    .party-detail { font-size: 10px; color: #666; margin-top: 5px; line-height: 1.7; }

    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
    thead th {
      background: #002651; color: #fff;
      padding: 10px 14px; text-align: left;
      font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    thead th.num { text-align: right; }
    tbody tr:nth-child(even) { background: #f0f4fa; }
    tbody td { padding: 10px 14px; font-size: 12px; border-bottom: 1px solid #e8e8e8; vertical-align: middle; }
    tbody td.num { text-align: right; font-weight: 700; }

    .total-section { margin-left: auto; width: 320px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 14px; font-size: 12px; }
    .total-row.final { background: #002651; color: #fff; font-size: 14px; font-weight: 700; border-radius: 6px; margin-top: 4px; }

    .banking {
      margin-top: 36px; padding: 20px 24px;
      background: #f8f9fc; border-left: 4px solid #002651;
      border-radius: 0 8px 8px 0;
    }
    .banking-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 14px; }
    .banking-grid { display: grid; grid-template-columns: 130px 1fr; gap: 6px 12px; }
    .bk { font-size: 11px; font-weight: 700; color: #555; }
    .bv { font-size: 11px; color: #111; }

    .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 9px; color: #bbb; text-align: center; line-height: 1.6; }

    @media print {
      body { padding: 24px; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body>

  <div class="header">
    <div>
      <div class="company-name">RiverRock Securities SAS</div>
      <div class="company-sub">
        [Dealer Address — Line 1]<br />
        [City, Postcode, Country]<br />
        [VAT / Registration No.]
      </div>
    </div>
    <div class="invoice-title">
      <h1>INVOICE</h1>
      <div class="invoice-meta">
        <strong>Invoice No.:</strong> ${he(invoiceNumber)}<br />
        <strong>Date:</strong> ${he(today)}<br />
        <strong>Reference:</strong> ${he(ref)}
      </div>
    </div>
  </div>

  <hr class="divider" />

  <div class="parties">
    <div>
      <div class="party-label">From</div>
      <div class="party-name">RiverRock Securities SAS, France</div>
      <div class="party-detail">
        [Dealer Address — to be completed]<br />
        [City, Postcode, Country]<br />
        [VAT No. — to be completed]
      </div>
    </div>
    <div>
      <div class="party-label">Bill To</div>
      <div class="party-name">${he(issuer)}</div>
      <div class="party-detail">
        [Counterparty address — to be completed]
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Reference</th>
        <th>ISIN</th>
        <th>Product</th>
        <th>Issuer</th>
        <th>Trade Date</th>
        <th>Value Date</th>
        <th>CCY</th>
        <th class="num">Size</th>
        <th class="num">Gross Fees</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${he(ref)}</td>
        <td><strong>${he(isin)}</strong></td>
        <td>${he(product)}</td>
        <td>${he(issuer)}</td>
        <td>${he(tradeDate)}</td>
        <td>${he(valueDate)}</td>
        <td><strong>${he(ccy)}</strong></td>
        <td class="num">${he(size)}</td>
        <td class="num">${he(grossFees)}</td>
      </tr>
    </tbody>
  </table>

  <div class="total-section">
    <div class="total-row">
      <span>Subtotal</span>
      <span>${he(grossFees)} ${he(ccy)}</span>
    </div>
    <div class="total-row">
      <span>VAT (0%)</span>
      <span>0.00 ${he(ccy)}</span>
    </div>
    <div class="total-row final">
      <span>Total Due</span>
      <span>${he(grossFees)} ${he(ccy)}</span>
    </div>
  </div>

  <div class="banking">
    <div class="banking-label">Payment Instructions — RiverRock Securities SAS</div>
    <div class="banking-grid">
      <span class="bk">Bank Name:</span><span class="bv">[To be completed]</span>
      <span class="bk">Account Name:</span><span class="bv">RiverRock Securities SAS</span>
      <span class="bk">IBAN:</span><span class="bv">[To be completed]</span>
      <span class="bk">BIC / SWIFT:</span><span class="bv">[To be completed]</span>
      <span class="bk">Payment Ref.:</span><span class="bv">${he(invoiceNumber)}</span>
    </div>
  </div>

  <div class="footer">
    Generated by Valeur Europe Trade Management System on ${he(today)}.<br />
    Please ensure payment is made quoting the invoice reference above.
  </div>

</body>
</html>`;

  const win = window.open("", "_blank", "width=960,height=720");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

// ─── UI helpers ────────────────────────────────────────────────────────────────

function InvoiceStatusBadge({ status }: { status: "pending" | "paid" }) {
  if (status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold px-2 py-0.5">
        <CheckCircle className="h-3 w-3" />
        Paid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold px-2 py-0.5">
      <Clock className="h-3 w-3" />
      Pending
    </span>
  );
}

function SummaryCard({
  label,
  value,
  sub,
  colorClass,
}: {
  label: string;
  value: string;
  sub: string;
  colorClass?: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${colorClass ?? "border-black/8 bg-white"}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">{label}</div>
      <div className="text-2xl font-bold mt-1.5">{value}</div>
      <div className="text-[11px] mt-1 opacity-60">{sub}</div>
    </div>
  );
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  const active = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition ${
          active ? "bg-[#002651] text-white border-[#002651]" : "border-black/20 hover:bg-black/5"
        }`}
      >
        {label}
        {active && (
          <span className="rounded-full bg-white/25 text-[10px] font-bold px-1.5 py-px">
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-[200px] max-h-64 overflow-y-auto rounded-xl border border-black/10 bg-white shadow-xl">
          <div className="flex items-center justify-between px-3 py-2 border-b border-black/8 text-xs">
            <button className="font-bold text-black/50 hover:text-black" onClick={() => onChange([...options])}>
              Select all
            </button>
            <button className="font-bold text-black/50 hover:text-black" onClick={() => onChange([])}>
              Clear
            </button>
          </div>
          {options.length === 0 && (
            <div className="px-3 py-3 text-xs text-black/40">No options</div>
          )}
          {options.map((o) => (
            <label
              key={o}
              className={`flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer ${
                selected.includes(o) ? "bg-blue-50 font-bold" : "hover:bg-black/4"
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={() => toggle(o)}
                className="accent-[#002651]"
              />
              <span className="truncate">{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function InvoicingPage() {
  const [tab, setTab] = useState<"receivables" | "payables">("receivables");
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [invoiceMap, setInvoiceMap] = useState<Map<string, InvoiceRecord>>(new Map());
  const [retroMap, setRetroMap] = useState<Map<string, RetroPaymentRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Receivables filters
  const [recvStatusFilter, setRecvStatusFilter] = useState<"all" | "pending" | "paid">("all");
  const [recvIssuerFilter, setRecvIssuerFilter] = useState<string[]>([]);
  const [recvCcyFilter, setRecvCcyFilter] = useState<string[]>([]);
  const [recvIsinFilter, setRecvIsinFilter] = useState("");
  const [recvTradeDateFrom, setRecvTradeDateFrom] = useState("");
  const [recvTradeDateTo, setRecvTradeDateTo] = useState("");
  const [recvValueDateFrom, setRecvValueDateFrom] = useState("");
  const [recvValueDateTo, setRecvValueDateTo] = useState("");

  // Payables filters
  const [payClientFilter, setPayClientFilter] = useState<string[]>([]);
  const [payIntroducerFilter, setPayIntroducerFilter] = useState<string[]>([]);
  const [payIsinFilter, setPayIsinFilter] = useState("");
  const [payTradeStatusFilter, setPayTradeStatusFilter] = useState("all");
  const [payPaymentStatusFilter, setPayPaymentStatusFilter] = useState<RetroStatus | "all">("all");
  const [payDateFrom, setPayDateFrom] = useState("");
  const [payDateTo, setPayDateTo] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }

  // ─── Data fetching ─────────────────────────────────────────────────────────

  async function fetchData() {
    setLoading(true);
    try {
      const { data: tradeData, error: tradeError } = await supabase
        .from("trades")
        .select(
          `
          id, trade_date, value_date, reference, status,
          total_size, pnl_trade_ccy,
          retro_client, retro_introducer,
          retro_client_input, retro_introducer_input,
          client_name, introducer_name,
          booking_entity:booking_entity_id(legal_name),
          product:product_id(
            isin, product_name, currency, settlement,
            issuer:issuer_id(legal_name)
          )
        `
        )
        .order("trade_date", { ascending: false });

      if (tradeError) throw tradeError;

      const allTrades = (tradeData ?? []) as TradeRow[];
      setTrades(allTrades);

      const tradeIds = allTrades.map((t) => t.id);
      if (tradeIds.length === 0) return;

      const [{ data: invData }, { data: retroData }] = await Promise.all([
        supabase
          .from("invoices")
          .select("id, trade_id, downloaded_at, payment_status, created_at")
          .in("trade_id", tradeIds),
        supabase
          .from("retro_payments")
          .select("id, trade_id, payment_status, created_at")
          .in("trade_id", tradeIds),
      ]);

      const imap = new Map<string, InvoiceRecord>();
      for (const r of invData ?? []) imap.set(r.trade_id, r as InvoiceRecord);
      setInvoiceMap(imap);

      const rmap = new Map<string, RetroPaymentRecord>();
      for (const r of retroData ?? []) rmap.set(r.trade_id, r as RetroPaymentRecord);
      setRetroMap(rmap);
    } catch (err) {
      console.error("Invoicing fetch error:", err);
      showToast("Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Derived data ──────────────────────────────────────────────────────────

  const receivableTrades = useMemo(
    () =>
      trades.filter(
        (t) =>
          t.booking_entity?.legal_name === BOOKING_ENTITY &&
          Number(t.pnl_trade_ccy ?? 0) > 0
      ),
    [trades]
  );

  const payableTrades = useMemo(
    () =>
      trades.filter(
        (t) => Number(t.retro_client ?? 0) > 0 || Number(t.retro_introducer ?? 0) > 0
      ),
    [trades]
  );

  // Filter option lists
  const recvIssuerOptions = useMemo(
    () =>
      [...new Set(receivableTrades.map((t) => t.product?.issuer?.legal_name).filter(Boolean))] as string[],
    [receivableTrades]
  );
  const recvCcyOptions = useMemo(
    () =>
      [...new Set(receivableTrades.map((t) => t.product?.currency).filter(Boolean))] as string[],
    [receivableTrades]
  );
  const payClientOptions = useMemo(
    () => [...new Set(payableTrades.map((t) => t.client_name).filter(Boolean))] as string[],
    [payableTrades]
  );
  const payIntroducerOptions = useMemo(
    () =>
      [...new Set(payableTrades.map((t) => t.introducer_name).filter(Boolean))] as string[],
    [payableTrades]
  );

  // Filtered receivables
  const filteredReceivables = useMemo(() => {
    return receivableTrades.filter((t) => {
      const status = invoiceMap.get(t.id)?.payment_status ?? "pending";
      if (recvStatusFilter !== "all" && status !== recvStatusFilter) return false;
      if (recvIssuerFilter.length && !recvIssuerFilter.includes(t.product?.issuer?.legal_name ?? "")) return false;
      if (recvCcyFilter.length && !recvCcyFilter.includes(t.product?.currency ?? "")) return false;
      if (recvIsinFilter && !(t.product?.isin ?? "").toLowerCase().includes(recvIsinFilter.toLowerCase())) return false;
      if (recvTradeDateFrom && (t.trade_date ?? "") < recvTradeDateFrom) return false;
      if (recvTradeDateTo && (t.trade_date ?? "") > recvTradeDateTo) return false;
      if (recvValueDateFrom && (t.value_date ?? "") < recvValueDateFrom) return false;
      if (recvValueDateTo && (t.value_date ?? "") > recvValueDateTo) return false;
      return true;
    });
  }, [receivableTrades, invoiceMap, recvStatusFilter, recvIssuerFilter, recvCcyFilter, recvIsinFilter, recvTradeDateFrom, recvTradeDateTo, recvValueDateFrom, recvValueDateTo]);

  // Filtered payables
  const filteredPayables = useMemo(() => {
    return payableTrades.filter((t) => {
      const status = retroMap.get(t.id)?.payment_status ?? "invoice_not_received";
      if (payClientFilter.length && !payClientFilter.includes(t.client_name ?? "")) return false;
      if (payIntroducerFilter.length && !payIntroducerFilter.includes(t.introducer_name ?? "")) return false;
      if (payIsinFilter && !(t.product?.isin ?? "").toLowerCase().includes(payIsinFilter.toLowerCase())) return false;
      if (payTradeStatusFilter !== "all" && (t.status ?? "") !== payTradeStatusFilter) return false;
      if (payPaymentStatusFilter !== "all" && status !== payPaymentStatusFilter) return false;
      if (payDateFrom && (t.trade_date ?? "") < payDateFrom) return false;
      if (payDateTo && (t.trade_date ?? "") > payDateTo) return false;
      return true;
    });
  }, [payableTrades, retroMap, payClientFilter, payIntroducerFilter, payIsinFilter, payTradeStatusFilter, payPaymentStatusFilter, payDateFrom, payDateTo]);

  // Summary totals — receivables
  const recvTotals = useMemo(() => {
    const pending = filteredReceivables.filter(
      (t) => (invoiceMap.get(t.id)?.payment_status ?? "pending") === "pending"
    );
    const paid = filteredReceivables.filter(
      (t) => invoiceMap.get(t.id)?.payment_status === "paid"
    );
    return {
      total: filteredReceivables.reduce((s, t) => s + Number(t.pnl_trade_ccy ?? 0), 0),
      outstanding: pending.reduce((s, t) => s + Number(t.pnl_trade_ccy ?? 0), 0),
      paid: paid.reduce((s, t) => s + Number(t.pnl_trade_ccy ?? 0), 0),
      pendingCount: pending.length,
      paidCount: paid.length,
    };
  }, [filteredReceivables, invoiceMap]);

  // Summary totals — payables
  const payTotals = useMemo(() => {
    const totalClient = filteredPayables.reduce((s, t) => s + Number(t.retro_client ?? 0), 0);
    const totalIntroducer = filteredPayables.reduce(
      (s, t) => s + Number(t.retro_introducer ?? 0),
      0
    );
    return {
      total: totalClient + totalIntroducer,
      totalClient,
      totalIntroducer,
      clientCount: filteredPayables.filter((t) => Number(t.retro_client ?? 0) > 0).length,
      introducerCount: filteredPayables.filter((t) => Number(t.retro_introducer ?? 0) > 0).length,
    };
  }, [filteredPayables]);

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function handleGenerateInvoice(trade: TradeRow) {
    generateInvoicePdf(trade);

    const existing = invoiceMap.get(trade.id);
    const now = new Date().toISOString();

    if (existing) {
      await supabase
        .from("invoices")
        .update({ downloaded_at: now })
        .eq("id", existing.id);
      setInvoiceMap((prev) => {
        const next = new Map(prev);
        next.set(trade.id, { ...existing, downloaded_at: now });
        return next;
      });
    } else {
      const { data } = await supabase
        .from("invoices")
        .insert({ trade_id: trade.id, downloaded_at: now, payment_status: "pending" })
        .select()
        .single();
      if (data) {
        setInvoiceMap((prev) => {
          const next = new Map(prev);
          next.set(trade.id, data as InvoiceRecord);
          return next;
        });
      }
    }
  }

  async function togglePaymentStatus(trade: TradeRow) {
    const existing = invoiceMap.get(trade.id);
    const next: "pending" | "paid" =
      (existing?.payment_status ?? "pending") === "pending" ? "paid" : "pending";

    if (existing) {
      await supabase.from("invoices").update({ payment_status: next }).eq("id", existing.id);
      setInvoiceMap((prev) => {
        const m = new Map(prev);
        m.set(trade.id, { ...existing, payment_status: next });
        return m;
      });
    } else {
      const { data } = await supabase
        .from("invoices")
        .insert({ trade_id: trade.id, payment_status: next })
        .select()
        .single();
      if (data) {
        setInvoiceMap((prev) => {
          const m = new Map(prev);
          m.set(trade.id, data as InvoiceRecord);
          return m;
        });
      }
    }
    showToast(`Invoice status → ${next}`);
  }

  async function updateRetroStatus(trade: TradeRow, newStatus: RetroStatus) {
    const existing = retroMap.get(trade.id);

    if (existing) {
      await supabase
        .from("retro_payments")
        .update({ payment_status: newStatus })
        .eq("id", existing.id);
      setRetroMap((prev) => {
        const m = new Map(prev);
        m.set(trade.id, { ...existing, payment_status: newStatus });
        return m;
      });
    } else {
      const { data } = await supabase
        .from("retro_payments")
        .insert({ trade_id: trade.id, payment_status: newStatus })
        .select()
        .single();
      if (data) {
        setRetroMap((prev) => {
          const m = new Map(prev);
          m.set(trade.id, data as RetroPaymentRecord);
          return m;
        });
      }
    }
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  const tabBtn = (t: "receivables" | "payables", label: string) => (
    <button
      onClick={() => setTab(t)}
      className={`px-5 py-2.5 rounded-xl text-sm font-bold transition ${
        tab === t ? "bg-[#002651] text-white shadow-sm" : "text-black/60 hover:bg-black/8"
      }`}
    >
      {label}
    </button>
  );

  const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <th
      className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-[#002651] text-white ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );

  const rowBg = (i: number) =>
    i % 2 === 0 ? "bg-[#DEE7F0]/50" : "bg-white";

  const filterInput = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    width = "w-36"
  ) => (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${width} rounded-xl border border-black/20 px-3 py-2 text-sm font-bold`}
    />
  );

  const dateInput = (value: string, onChange: (v: string) => void) => (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
    />
  );

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="text-sm text-black/40 font-medium">Loading invoicing data…</div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] rounded-xl bg-black text-white px-5 py-2.5 text-sm font-bold shadow-xl">
          {toast}
        </div>
      )}

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-black">Invoicing</h1>
        <p className="text-sm text-black/50 mt-0.5">Manage receivables and payables</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1.5 p-1.5 bg-black/5 rounded-2xl w-fit">
        {tabBtn("receivables", "Receivables")}
        {tabBtn("payables", "Payables")}
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* RECEIVABLES                                               */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === "receivables" && (
        <div className="space-y-5">

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard
              label="Total Gross Fees"
              value={formatNumber(recvTotals.total)}
              sub={`${filteredReceivables.length} trade${filteredReceivables.length !== 1 ? "s" : ""}`}
              colorClass="border-black/8 bg-white text-black"
            />
            <SummaryCard
              label="Outstanding"
              value={formatNumber(recvTotals.outstanding)}
              sub={`${recvTotals.pendingCount} pending`}
              colorClass="border-amber-200 bg-amber-50 text-amber-700"
            />
            <SummaryCard
              label="Paid"
              value={formatNumber(recvTotals.paid)}
              sub={`${recvTotals.paidCount} invoices paid`}
              colorClass="border-emerald-200 bg-emerald-50 text-emerald-700"
            />
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-black/8 bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              {filterInput(recvIsinFilter, setRecvIsinFilter, "Filter ISIN…")}
              <MultiSelectFilter
                label="Issuer"
                options={recvIssuerOptions}
                selected={recvIssuerFilter}
                onChange={setRecvIssuerFilter}
              />
              <MultiSelectFilter
                label="CCY"
                options={recvCcyOptions}
                selected={recvCcyFilter}
                onChange={setRecvCcyFilter}
              />
              <select
                value={recvStatusFilter}
                onChange={(e) => setRecvStatusFilter(e.target.value as "all" | "pending" | "paid")}
                className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
              >
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
              {(recvIsinFilter ||
                recvIssuerFilter.length ||
                recvCcyFilter.length ||
                recvStatusFilter !== "all" ||
                recvTradeDateFrom ||
                recvTradeDateTo ||
                recvValueDateFrom ||
                recvValueDateTo) && (
                <button
                  onClick={() => {
                    setRecvIsinFilter("");
                    setRecvIssuerFilter([]);
                    setRecvCcyFilter([]);
                    setRecvStatusFilter("all");
                    setRecvTradeDateFrom("");
                    setRecvTradeDateTo("");
                    setRecvValueDateFrom("");
                    setRecvValueDateTo("");
                  }}
                  className="text-xs font-bold text-black/40 hover:text-black underline"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center text-xs font-bold text-black/50">
              <span>Trade Date</span>
              {dateInput(recvTradeDateFrom, setRecvTradeDateFrom)}
              <span className="text-black/30">→</span>
              {dateInput(recvTradeDateTo, setRecvTradeDateTo)}
              <span className="ml-3">Value Date</span>
              {dateInput(recvValueDateFrom, setRecvValueDateFrom)}
              <span className="text-black/30">→</span>
              {dateInput(recvValueDateTo, setRecvValueDateTo)}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-black/8 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <TH>Reference</TH>
                    <TH>Issuer</TH>
                    <TH>ISIN</TH>
                    <TH>Trade Date</TH>
                    <TH>Value Date</TH>
                    <TH>Product</TH>
                    <TH>CCY</TH>
                    <TH right>Size</TH>
                    <TH right>Gross Fees</TH>
                    <TH>Invoice Status</TH>
                    <TH>Downloaded</TH>
                    <TH>Actions</TH>
                  </tr>
                </thead>
                <tbody>
                  {filteredReceivables.length === 0 && (
                    <tr>
                      <td colSpan={12} className="text-center py-14 text-black/30 text-sm">
                        No receivables match your filters.
                      </td>
                    </tr>
                  )}
                  {filteredReceivables.map((t, i) => {
                    const inv = invoiceMap.get(t.id);
                    const status = inv?.payment_status ?? "pending";
                    const downloaded = !!inv?.downloaded_at;

                    return (
                      <tr
                        key={t.id}
                        className={`border-t border-black/5 ${rowBg(i)} hover:bg-blue-50/60 transition-colors`}
                      >
                        <td className="px-4 py-3 text-[12px] font-bold whitespace-nowrap">
                          {t.reference ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[12px] max-w-[160px] truncate" title={t.product?.issuer?.legal_name ?? ""}>
                          {t.product?.issuer?.legal_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[12px] font-mono">
                          {t.product?.isin ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[12px] whitespace-nowrap">
                          {formatDate(t.trade_date)}
                        </td>
                        <td className="px-4 py-3 text-[12px] whitespace-nowrap">
                          {formatDate(t.value_date)}
                        </td>
                        <td className="px-4 py-3 text-[12px] max-w-[180px] truncate" title={t.product?.product_name ?? ""}>
                          {t.product?.product_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[12px] font-bold">
                          {t.product?.currency ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-right font-mono">
                          {formatNumber(t.total_size)}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-right font-mono font-bold text-emerald-700">
                          {formatNumber(t.pnl_trade_ccy)}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => togglePaymentStatus(t)}
                            title="Click to toggle payment status"
                          >
                            <InvoiceStatusBadge status={status} />
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {downloaded ? (
                            <span
                              title={`Downloaded ${formatDate(inv?.downloaded_at)}`}
                              className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <span className="text-black/20 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleGenerateInvoice(t)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#002651] text-white px-3 py-1.5 text-[11px] font-bold hover:opacity-90 transition whitespace-nowrap"
                          >
                            <FileText className="h-3 w-3" />
                            Invoice
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PAYABLES                                                  */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === "payables" && (
        <div className="space-y-5">

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard
              label="Total Retros Owed"
              value={formatNumber(payTotals.total)}
              sub={`${filteredPayables.length} trade${filteredPayables.length !== 1 ? "s" : ""}`}
              colorClass="border-black/8 bg-white text-black"
            />
            <SummaryCard
              label="Client Retros"
              value={formatNumber(payTotals.totalClient)}
              sub={`${payTotals.clientCount} trades`}
              colorClass="border-blue-200 bg-blue-50 text-blue-700"
            />
            <SummaryCard
              label="Introducer Retros"
              value={formatNumber(payTotals.totalIntroducer)}
              sub={`${payTotals.introducerCount} trades`}
              colorClass="border-purple-200 bg-purple-50 text-purple-700"
            />
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-black/8 bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              {filterInput(payIsinFilter, setPayIsinFilter, "Filter ISIN…")}
              <MultiSelectFilter
                label="Client"
                options={payClientOptions}
                selected={payClientFilter}
                onChange={setPayClientFilter}
              />
              <MultiSelectFilter
                label="Introducer"
                options={payIntroducerOptions}
                selected={payIntroducerFilter}
                onChange={setPayIntroducerFilter}
              />
              <select
                value={payTradeStatusFilter}
                onChange={(e) => setPayTradeStatusFilter(e.target.value)}
                className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
              >
                <option value="all">All trade statuses</option>
                <option value="pending">Pending</option>
                <option value="booked">Booked</option>
              </select>
              <select
                value={payPaymentStatusFilter}
                onChange={(e) => setPayPaymentStatusFilter(e.target.value as RetroStatus | "all")}
                className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
              >
                <option value="all">All payment statuses</option>
                {RETRO_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {(payIsinFilter ||
                payClientFilter.length ||
                payIntroducerFilter.length ||
                payTradeStatusFilter !== "all" ||
                payPaymentStatusFilter !== "all" ||
                payDateFrom ||
                payDateTo) && (
                <button
                  onClick={() => {
                    setPayIsinFilter("");
                    setPayClientFilter([]);
                    setPayIntroducerFilter([]);
                    setPayTradeStatusFilter("all");
                    setPayPaymentStatusFilter("all");
                    setPayDateFrom("");
                    setPayDateTo("");
                  }}
                  className="text-xs font-bold text-black/40 hover:text-black underline"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center text-xs font-bold text-black/50">
              <span>Trade Date</span>
              {dateInput(payDateFrom, setPayDateFrom)}
              <span className="text-black/30">→</span>
              {dateInput(payDateTo, setPayDateTo)}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-black/8 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <TH>ISIN</TH>
                    <TH>Issue Date</TH>
                    <TH>Client Name</TH>
                    <TH>Introducer</TH>
                    <TH right>Size</TH>
                    <TH right>Retro Client %</TH>
                    <TH right>Retro Client Amt</TH>
                    <TH right>Retro Intro %</TH>
                    <TH right>Retro Intro Amt</TH>
                    <TH>Trade Status</TH>
                    <TH>Payment Status</TH>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayables.length === 0 && (
                    <tr>
                      <td colSpan={11} className="text-center py-14 text-black/30 text-sm">
                        No payables match your filters.
                      </td>
                    </tr>
                  )}
                  {filteredPayables.map((t, i) => {
                    const rp = retroMap.get(t.id);
                    const payStatus: RetroStatus =
                      rp?.payment_status ?? "invoice_not_received";
                    const ccy = t.product?.currency ?? "";
                    const settlement = t.product?.settlement;
                    const hasClientRetro = Number(t.retro_client ?? 0) > 0;
                    const hasIntroRetro = Number(t.retro_introducer ?? 0) > 0;

                    const selectColorClass =
                      RETRO_STATUS_OPTIONS.find((o) => o.value === payStatus)?.selectColor ??
                      "border-black/20";

                    return (
                      <tr
                        key={t.id}
                        className={`border-t border-black/5 ${rowBg(i)} hover:bg-blue-50/60 transition-colors`}
                      >
                        <td className="px-4 py-3 text-[12px] font-mono">
                          {t.product?.isin ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[12px] whitespace-nowrap">
                          {formatDate(t.trade_date)}
                        </td>
                        <td className="px-4 py-3 text-[12px] font-bold">
                          {t.client_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[12px]">
                          {t.introducer_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-right font-mono">
                          {formatNumber(t.total_size)}
                        </td>
                        {/* Retro Client % */}
                        <td className="px-4 py-3 text-[12px] text-right">
                          {hasClientRetro
                            ? settlement === "percent"
                              ? `${fmt2(t.retro_client_input)}%`
                              : `${fmt2(t.retro_client_input)} ${ccy}/unit`
                            : "—"}
                        </td>
                        {/* Retro Client Amt */}
                        <td className="px-4 py-3 text-[12px] text-right font-mono font-bold text-blue-700">
                          {hasClientRetro
                            ? `${formatNumber(t.retro_client)} ${ccy}`
                            : "—"}
                        </td>
                        {/* Retro Intro % */}
                        <td className="px-4 py-3 text-[12px] text-right">
                          {hasIntroRetro
                            ? settlement === "percent"
                              ? `${fmt2(t.retro_introducer_input)}%`
                              : `${fmt2(t.retro_introducer_input)} ${ccy}/unit`
                            : "—"}
                        </td>
                        {/* Retro Intro Amt */}
                        <td className="px-4 py-3 text-[12px] text-right font-mono font-bold text-purple-700">
                          {hasIntroRetro
                            ? `${formatNumber(t.retro_introducer)} ${ccy}`
                            : "—"}
                        </td>
                        {/* Trade Status */}
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full text-[11px] font-bold px-2 py-0.5 ${
                              t.status === "booked"
                                ? "bg-emerald-100 text-emerald-700"
                                : t.status === "cancelled"
                                ? "bg-red-100 text-red-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {t.status ?? "—"}
                          </span>
                        </td>
                        {/* Payment Status dropdown */}
                        <td className="px-4 py-3 min-w-[200px]">
                          <select
                            value={payStatus}
                            onChange={(e) =>
                              updateRetroStatus(t, e.target.value as RetroStatus)
                            }
                            className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold w-full transition ${selectColorClass}`}
                          >
                            {RETRO_STATUS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
