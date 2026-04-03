"use client";
export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useState } from "react";

function PaginationBar({ page, total, pageSize, label, onPage }: { page: number; total: number; pageSize: number; label: string; onPage: (p: number) => void }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-black/8 text-sm text-black/50 bg-white rounded-b-xl">
      <span>Showing {from}–{to} of {total} {label}</span>
      <div className="flex items-center gap-2">
        <button onClick={() => onPage(page - 1)} disabled={page === 0} className="px-3 py-1 rounded-lg border border-black/15 disabled:opacity-30 hover:bg-black/5 transition text-black/70">← Prev</button>
        <span className="text-black/60 font-medium">Page {page + 1} of {totalPages}</span>
        <button onClick={() => onPage(page + 1)} disabled={page >= totalPages - 1} className="px-3 py-1 rounded-lg border border-black/15 disabled:opacity-30 hover:bg-black/5 transition text-black/70">Next →</button>
      </div>
    </div>
  );
}
import { supabase } from "@/src/lib/supabase";
import { useProfile } from "../profile-context";

import { CheckCircle, Clock, FileText, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Settlement = "percent" | "units";

type TradeRow = {
  id: string;
  trade_date: string | null;
  value_date: string | null;
  reference: string | null;
  status: string | null;
  total_size: number | null;
  gross_fees: number | null;
  pnl_trade_ccy: number | null;
  retro_client: number | null;
  retro_introducer: number | null;
  retro_client_input: number | null;
  retro_introducer_input: number | null;
  fee_custodian: number | null;
  fee_custodian_input: number | null;
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

type RetroStatus =
  | "invoice_not_received"
  | "invoice_received"
  | "invoice_pending_amendment"
  | "payment_approved";

type RetroPaymentRecord = {
  id: string;
  trade_id: string;
  recipient_type: "client" | "introducer" | "custodian";
  payment_status: RetroStatus;
  created_at: string;
};

// One expanded row per recipient (client, introducer, or custodian)
type PayableRow = {
  key: string;
  trade: TradeRow;
  recipientType: "client" | "introducer" | "custodian";
  recipientName: string | null;
  retroPct: number | null;
  retroAmt: number | null;
};

type BillingRecord = {
  id: string;
  counterparty_id: string;
  billing_entity: string;
  postal_address: string;
  vat_number: string | null;
  billing_email: string | null;
};

type BankAccountRecord = {
  id: string;
  counterparty_id: string;
  currency: string;
  bank_name: string;
  iban: string | null;
  account_number: string | null;
  sort_code: string | null;
  bic: string | null;
  intermediary_bic: string | null;
};

// Pending invoice awaiting bank account selection
type PendingInvoice = {
  trade: TradeRow;
  dealerBilling: BillingRecord | null;
  dealerName: string;
  accounts: BankAccountRecord[]; // accounts for this trade's currency
};

// ─── Constants ────────────────────────────────────────────────────────────────

// BOOKING_ENTITY removed — fetched dynamically from group_entities by entity_type

const RETRO_STATUS_OPTIONS: {
  value: RetroStatus;
  label: string;
  selectColor: string;
}[] = [
  { value: "invoice_not_received", label: "Invoice not received", selectColor: "bg-red-50 border-red-300 text-red-700" },
  { value: "invoice_received", label: "Invoice received", selectColor: "bg-blue-50 border-blue-300 text-blue-700" },
  { value: "invoice_pending_amendment", label: "Invoice pending amendment", selectColor: "bg-amber-50 border-amber-300 text-amber-700" },
  { value: "payment_approved", label: "Payment approved", selectColor: "bg-emerald-50 border-emerald-300 text-emerald-700" },
];

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const y = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  const d = iso.slice(8, 10);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
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
  return String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}

function CcyBreakdown({ map }: { map: Map<string, number> }) {
  if (map.size === 0) return <span className="text-2xl font-bold">—</span>;
  const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 1) {
    const [ccy, amt] = entries[0];
    return <div><span className="text-2xl font-bold">{formatNumber(amt)}</span><span className="text-sm font-bold ml-1.5 opacity-60">{ccy}</span></div>;
  }
  return (
    <div className="space-y-0.5">
      {entries.map(([ccy, amt]) => (
        <div key={ccy} className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold">{formatNumber(amt)}</span>
          <span className="text-[11px] font-bold opacity-60">{ccy}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Invoice PDF generator ────────────────────────────────────────────────────

async function generateInvoicePdf(
  trade: TradeRow,
  senderBilling: BillingRecord | null,
  bankAccount: BankAccountRecord | null,
  dealerBilling: BillingRecord | null,
  dealerName: string,
  senderEntityName: string
) {
  const isin = trade.product?.isin ?? "—";
  const productName = trade.product?.product_name ?? "—";
  const ccy = trade.product?.currency ?? "—";
  const ref = trade.reference ?? "—";
  const tradeDate = formatDate(trade.trade_date);
  const valueDate = formatDate(trade.value_date);
  const grossFees = formatNumber(trade.gross_fees);
  const today = formatDate(new Date().toISOString().slice(0, 10));
  const invoiceNumber = `INV-${ref}-${new Date().getFullYear()}`;

  const senderName = senderBilling?.billing_entity ?? senderEntityName;
  const senderAddress = senderBilling?.postal_address ?? "[Address — to be completed]";
  const senderVat = senderBilling?.vat_number ? `VAT: ${senderBilling.vat_number}` : "";

  const billToName = (dealerBilling?.billing_entity ?? dealerName) || "—";
  const billToAddress = dealerBilling?.postal_address ?? "[Address — to be completed]";
  const billToVat = dealerBilling?.vat_number ? `VAT: ${dealerBilling.vat_number}` : "";

  // Build payment details rows — only include populated fields
  const payRows: string[] = [];
  if (bankAccount?.bank_name) payRows.push(`<span class="bk">Bank Name:</span><span class="bv">${he(bankAccount.bank_name)}</span>`);
  if (bankAccount?.iban) payRows.push(`<span class="bk">IBAN:</span><span class="bv">${he(bankAccount.iban)}</span>`);
  if (bankAccount?.account_number) payRows.push(`<span class="bk">Account No.:</span><span class="bv">${he(bankAccount.account_number)}</span>`);
  if (bankAccount?.sort_code) payRows.push(`<span class="bk">Sort Code:</span><span class="bv">${he(bankAccount.sort_code)}</span>`);
  if (bankAccount?.bic) payRows.push(`<span class="bk">BIC / SWIFT:</span><span class="bv">${he(bankAccount.bic)}</span>`);
  if (bankAccount?.intermediary_bic) payRows.push(`<span class="bk">Intermediary BIC:</span><span class="bv">${he(bankAccount.intermediary_bic)}</span>`);
  payRows.push(`<span class="bk">Payment Ref.:</span><span class="bv">${he(invoiceNumber)}</span>`);

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
    .company-sub { font-size: 10px; color: #888; margin-top: 6px; line-height: 1.6; white-space: pre-line; }
    .invoice-title h1 { font-size: 32px; font-weight: 700; color: #002651; text-align: right; }
    .invoice-meta { text-align: right; margin-top: 6px; font-size: 11px; color: #555; line-height: 1.8; }
    .divider { border: none; border-top: 2px solid #002651; margin: 24px 0; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-bottom: 32px; }
    .party-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 8px; }
    .party-name { font-size: 13px; font-weight: 700; color: #111; }
    .party-detail { font-size: 10px; color: #666; margin-top: 5px; line-height: 1.7; white-space: pre-line; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
    thead th { background: #002651; color: #fff; padding: 10px 14px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
    thead th.num { text-align: right; }
    tbody tr:nth-child(even) { background: #f0f4fa; }
    tbody td { padding: 10px 14px; font-size: 12px; border-bottom: 1px solid #e8e8e8; vertical-align: middle; }
    tbody td.num { text-align: right; font-weight: 700; }
    .total-section { margin-left: auto; width: 320px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 14px; font-size: 12px; }
    .total-row.final { background: #002651; color: #fff; font-size: 14px; font-weight: 700; border-radius: 6px; margin-top: 4px; }
    .banking { margin-top: 36px; padding: 20px 24px; background: #f8f9fc; border-left: 4px solid #002651; border-radius: 0 8px 8px 0; }
    .banking-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 14px; }
    .banking-grid { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; }
    .bk { font-size: 11px; font-weight: 700; color: #555; }
    .bv { font-size: 11px; color: #111; }
    .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e0e0e0; font-size: 9px; color: #bbb; text-align: center; line-height: 1.6; }
    @media print { body { padding: 24px; } @page { margin: 1.5cm; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="company-name">${he(senderName)}</div>
      <div class="company-sub">${he(senderAddress)}${senderVat ? `\n${he(senderVat)}` : ""}</div>
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
      <div class="party-name">${he(senderName)}</div>
      <div class="party-detail">${he(senderAddress)}${senderVat ? `\n${he(senderVat)}` : ""}</div>
    </div>
    <div>
      <div class="party-label">Bill To</div>
      <div class="party-name">${he(billToName)}</div>
      <div class="party-detail">${he(billToAddress)}${billToVat ? `\n${he(billToVat)}` : ""}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>ISIN</th>
        <th>Trade Date</th>
        <th>Value Date</th>
        <th>CCY</th>
        <th class="num">Gross Fees</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${he(productName)}</td>
        <td><strong>${he(isin)}</strong></td>
        <td>${he(tradeDate)}</td>
        <td>${he(valueDate)}</td>
        <td><strong>${he(ccy)}</strong></td>
        <td class="num">${he(grossFees)}</td>
      </tr>
    </tbody>
  </table>
  <div class="total-section">
    <div class="total-row final"><span>Total Due</span><span>${he(grossFees)} ${he(ccy)}</span></div>
  </div>
  <div class="banking">
    <div class="banking-label">Payment Instructions — ${he(senderName)}</div>
    <div class="banking-grid">
      ${payRows.join("\n      ")}
    </div>
  </div>
  <div class="footer">
    ${he(senderName)} est dument habilitée à exercer en France une activité d'Entreprise d'Investissement par la Banque de France (www.banque-france.fr), via l'Autorité de Contrôle Prudentiel et de Résolution (www.acpr.banque-france.fr).
  </div>
</body>
</html>`;

  // Render HTML in a hidden off-screen iframe, capture with html-to-image,
  // then embed in jsPDF for a clean download (no browser print headers/footers).
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-9999px;top:0;width:794px;border:none;visibility:hidden;";
  document.body.appendChild(iframe);
  try {
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(html);
    iframe.contentDocument!.close();
    // Wait for fonts/layout to settle
    await new Promise((r) => setTimeout(r, 600));
    const body = iframe.contentDocument!.body;
    const contentHeight = body.scrollHeight;
    iframe.style.height = `${contentHeight}px`;
    const { toJpeg } = await import("html-to-image");
    const dataUrl = await toJpeg(body, { width: 794, pixelRatio: 2, quality: 0.85 });
    const { jsPDF } = await import("jspdf");
    const pdfW = 210; // A4 width in mm
    const pdfH = (contentHeight / 794) * pdfW;
    const pdf = new jsPDF({ unit: "mm", format: pdfH <= 297 ? "a4" : [pdfW, pdfH] });
    pdf.addImage(dataUrl, "JPEG", 0, 0, pdfW, pdfH <= 297 ? 297 : pdfH);
    pdf.save(`${invoiceNumber}.pdf`);
  } finally {
    document.body.removeChild(iframe);
  }
}

// ─── UI helpers ────────────────────────────────────────────────────────────────

function InvoiceStatusBadge({ status }: { status: "pending" | "paid" }) {
  if (status === "paid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold px-2 py-0.5">
        <CheckCircle className="h-3 w-3" />Paid
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold px-2 py-0.5">
      <Clock className="h-3 w-3" />Pending
    </span>
  );
}

function SummaryCard({ label, children, sub, colorClass }: {
  label: string; children: React.ReactNode; sub: string; colorClass?: string;
}) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${colorClass ?? "border-black/8 bg-white"}`}>
      <div className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-2">{label}</div>
      {children}
      <div className="text-[11px] mt-1.5 opacity-60">{sub}</div>
    </div>
  );
}

function MultiSelectFilter({
  label, options, selected, onChange, searchable, labelMap,
}: {
  label: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void; searchable?: boolean;
  labelMap?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (v: string) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
  const filteredOptions = searchable && search
    ? options.filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    : options;
  const active = selected.length > 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-bold transition ${active ? "bg-[#002651] text-white border-[#002651]" : "border-black/20 hover:bg-black/5"}`}
      >
        {label}
        {active && <span className="rounded-full bg-white/25 text-[10px] font-bold px-1.5 py-px">{selected.length}</span>}
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 min-w-[220px] rounded-xl border border-black/10 bg-white shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-black/8 text-xs">
            <button className="font-bold text-black/50 hover:text-black" onClick={() => onChange([...options])}>Select all</button>
            <button className="font-bold text-black/50 hover:text-black" onClick={() => onChange([])}>Clear</button>
          </div>
          {searchable && (
            <div className="px-2 py-2 border-b border-black/8">
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="w-full rounded-lg border border-black/15 px-2.5 py-1.5 text-xs font-medium outline-none focus:border-[#002651]" />
            </div>
          )}
          <div className="max-h-56 overflow-y-auto">
            {filteredOptions.length === 0 && <div className="px-3 py-3 text-xs text-black/40">No matches</div>}
            {filteredOptions.map((o) => (
              <label key={o} className={`flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer ${selected.includes(o) ? "bg-blue-50 font-bold" : "hover:bg-black/4"}`}>
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} className="accent-[#002651]" />
                <span className="truncate">{labelMap?.[o] ?? o}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportPayablesToCsv(rows: PayableRow[], retroMap: Map<string, RetroPaymentRecord>) {
  const payStatusLabels = Object.fromEntries(RETRO_STATUS_OPTIONS.map((o) => [o.value, o.label]));
  const headers = ["ISIN", "Trade Date", "Recipient Name", "Recipient Type", "CCY", "Size", "Retro %", "Retro Amt", "Trade Status", "Payment Status"];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[,"\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [
    headers.map(esc).join(","),
    ...rows.map((r) => {
      const status = retroMap.get(r.key)?.payment_status ?? "invoice_not_received";
      const ccy = r.trade.product?.currency ?? "";
      const settlement = r.trade.product?.settlement;
      const retroPctStr = r.retroPct !== null && r.retroPct !== undefined
        ? (settlement === "percent" ? `${fmt2(r.retroPct)}%` : `${fmt2(r.retroPct)} ${ccy}/unit`)
        : "";
      return [
        r.trade.product?.isin ?? "",
        formatDate(r.trade.trade_date),
        r.recipientName ?? "",
        r.recipientType === "client" ? "Client" : r.recipientType === "introducer" ? "Introducer" : "Custodian",
        ccy,
        r.trade.total_size ?? "",
        retroPctStr,
        r.retroAmt ?? "",
        r.trade.status ?? "",
        payStatusLabels[status] ?? status,
      ].map(esc).join(",");
    }),
  ];
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `retro-payables-export-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function InvoicingPage() {
  const profile = useProfile();
  const isAdmin = profile?.role === "admin";
  const canTogglePayment = profile?.role === "admin" || profile?.role === "payments";
  const [tab, setTab] = useState<"receivables" | "payables">("receivables");
  const [trades, setTrades] = useState<TradeRow[]>([]);
  const [invoiceMap, setInvoiceMap] = useState<Map<string, InvoiceRecord>>(new Map());
  const [retroMap, setRetroMap] = useState<Map<string, RetroPaymentRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Dealer name per trade_id (from trade_legs join)
  const [dealerMap, setDealerMap] = useState<Map<string, string>>(new Map());
  const [custodianMap, setCustodianMap] = useState<Map<string, string>>(new Map());

  // Internal (RiverRock) billing + bank accounts, loaded at page init
  const [senderBilling, setSenderBilling] = useState<BillingRecord | null>(null);
  const [senderBankAccounts, setSenderBankAccounts] = useState<BankAccountRecord[]>([]);
  // Entity name for receivables filter — fetched by entity_type so rename-safe
  const [riverrockEntityName, setRiverrockEntityName] = useState<string>("");

  // Bank account selection modal (shown when multiple accounts match trade currency)
  const [pendingInvoice, setPendingInvoice] = useState<PendingInvoice | null>(null);
  const [selectedBankId, setSelectedBankId] = useState<string>("");

  // Receivables filters
  const PAGE_SIZE = 50;
  const [receivablesPage, setReceivablesPage] = useState(0);
  const [payablesPage, setPayablesPage] = useState(0);

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
  const [payPaymentStatusFilter, setPayPaymentStatusFilter] = useState<RetroStatus[]>([]);
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
        .select(`
          id, trade_date, value_date, reference, status,
          total_size, gross_fees, pnl_trade_ccy,
          retro_client, retro_introducer,
          retro_client_input, retro_introducer_input,
          fee_custodian, fee_custodian_input,
          client_name, introducer_name,
          booking_entity:booking_entity_id(legal_name),
          product:product_id(
            isin, product_name, currency, settlement,
            issuer:issuer_id(legal_name)
          )
        `)
        .neq("status", "cancelled")
        .order("trade_date", { ascending: false });

      if (tradeError) throw tradeError;
      const allTrades = (tradeData ?? []) as unknown as TradeRow[];
      setTrades(allTrades);

      const tradeIds = allTrades.map((t) => t.id);
      if (tradeIds.length === 0) return;

      // Fetch invoices, retro payments, and dealer legs in parallel
      const [
        { data: invData },
        { data: retroData },
        { data: legData },
        { data: rrEntityData },
      ] = await Promise.all([
        supabase.from("invoices").select("id, trade_id, downloaded_at, payment_status, created_at").in("trade_id", tradeIds),
        supabase.from("retro_payments").select("id, trade_id, recipient_type, payment_status, created_at").in("trade_id", tradeIds),
        supabase.from("trade_legs").select("trade_id, counterparty:counterparty_id(legal_name, cp_type)").in("trade_id", tradeIds),
        supabase.from("group_entities").select("legal_name").eq("entity_type", "riverrock").maybeSingle(),
      ]);

      // Invoice map
      const imap = new Map<string, InvoiceRecord>();
      for (const r of invData ?? []) imap.set(r.trade_id, r as InvoiceRecord);
      setInvoiceMap(imap);

      // Retro payments map: key = `${trade_id}:${recipient_type}`
      const rmap = new Map<string, RetroPaymentRecord>();
      for (const r of retroData ?? []) rmap.set(`${r.trade_id}:${r.recipient_type}`, r as RetroPaymentRecord);
      setRetroMap(rmap);

      // Dealer map: trade_id → dealer legal_name (first dealer leg found per trade)
      // Custodian map: trade_id → custodian legal_name (first custodian leg found per trade)
      const dmap = new Map<string, string>();
      const cmap = new Map<string, string>();
      for (const leg of legData ?? []) {
        const cp = Array.isArray((leg as any).counterparty) ? (leg as any).counterparty[0] : (leg as any).counterparty;
        if (cp?.cp_type === "issuer_dealer" && !dmap.has(leg.trade_id)) {
          dmap.set(leg.trade_id, cp.legal_name);
        }
        // Custodian = non-dealer, non-internal leg (cp_type may vary, e.g. "other")
        if (cp?.cp_type !== "issuer_dealer" && cp?.cp_type !== "internal" && !cmap.has(leg.trade_id)) {
          cmap.set(leg.trade_id, cp.legal_name);
        }
      }
      setDealerMap(dmap);
      setCustodianMap(cmap);

      // Set the RiverRock entity name for receivables filter (rename-safe)
      const rrEntity = rrEntityData as { legal_name: string } | null;
      if (rrEntity?.legal_name) setRiverrockEntityName(rrEntity.legal_name);

      // Sender (internal) billing + bank accounts
      // Use RiverRock entity name (from entity_type, not hardcoded) to disambiguate
      // when multiple counterparties share cp_type = 'internal'
      const { data: internalCpData } = rrEntity?.legal_name
        ? await supabase.from("counterparties").select("id").eq("cp_type", "internal").eq("legal_name", rrEntity.legal_name).maybeSingle()
        : { data: null };
      const internalCp = internalCpData as { id: string } | null;
      if (internalCp) {
        const [{ data: billing }, { data: banks }] = await Promise.all([
          supabase.from("counterparty_billing").select("*").eq("counterparty_id", internalCp.id).maybeSingle(),
          supabase.from("counterparty_bank_accounts").select("*").eq("counterparty_id", internalCp.id),
        ]);
        setSenderBilling(billing as BillingRecord | null);
        setSenderBankAccounts((banks ?? []) as BankAccountRecord[]);
      }
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
    () => trades.filter((t) => riverrockEntityName && t.booking_entity?.legal_name === riverrockEntityName && Number(t.gross_fees ?? 0) > 0),
    [trades, riverrockEntityName]
  );

  const payableTrades = useMemo(
    () => trades.filter((t) =>
      Number(t.retro_client ?? 0) > 0 ||
      Number(t.retro_introducer ?? 0) > 0 ||
      Number(t.fee_custodian ?? 0) > 0
    ),
    [trades]
  );

  const payableRows = useMemo<PayableRow[]>(() => {
    const rows: PayableRow[] = [];
    for (const t of payableTrades) {
      if (Number(t.retro_client ?? 0) > 0) rows.push({ key: `${t.id}:client`, trade: t, recipientType: "client", recipientName: t.client_name, retroPct: t.retro_client_input, retroAmt: t.retro_client });
      if (Number(t.retro_introducer ?? 0) > 0) rows.push({ key: `${t.id}:introducer`, trade: t, recipientType: "introducer", recipientName: t.introducer_name, retroPct: t.retro_introducer_input, retroAmt: t.retro_introducer });
      if (Number(t.fee_custodian ?? 0) > 0) rows.push({ key: `${t.id}:custodian`, trade: t, recipientType: "custodian", recipientName: custodianMap.get(t.id) ?? null, retroPct: t.fee_custodian_input, retroAmt: t.fee_custodian });
    }
    return rows;
  }, [payableTrades, custodianMap]);

  // Filter option lists
  const recvIssuerOptions = useMemo(
    () => [...new Set(receivableTrades.map((t) => t.product?.issuer?.legal_name).filter(Boolean))] as string[],
    [receivableTrades]
  );
  const recvCcyOptions = useMemo(
    () => [...new Set(receivableTrades.map((t) => t.product?.currency).filter(Boolean))] as string[],
    [receivableTrades]
  );
  const payClientOptions = useMemo(
    () => [...new Set(payableRows.filter((r) => r.recipientType === "client").map((r) => r.recipientName).filter(Boolean))] as string[],
    [payableRows]
  );
  const payIntroducerOptions = useMemo(
    () => [...new Set(payableRows.filter((r) => r.recipientType === "introducer").map((r) => r.recipientName).filter(Boolean))] as string[],
    [payableRows]
  );

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

  const filteredPayableRows = useMemo(() => {
    return payableRows.filter((r) => {
      const status = retroMap.get(r.key)?.payment_status ?? "invoice_not_received";
      const clientActive = payClientFilter.length > 0;
      const introducerActive = payIntroducerFilter.length > 0;
      if (clientActive || introducerActive) {
        const matchesClient = clientActive && r.recipientType === "client" && payClientFilter.includes(r.recipientName ?? "");
        const matchesIntroducer = introducerActive && r.recipientType === "introducer" && payIntroducerFilter.includes(r.recipientName ?? "");
        const isCustodian = r.recipientType === "custodian"; // custodian rows always shown regardless of client/introducer filter
        if (!matchesClient && !matchesIntroducer && !isCustodian) return false;
      }
      if (payIsinFilter && !(r.trade.product?.isin ?? "").toLowerCase().includes(payIsinFilter.toLowerCase())) return false;
      if (payTradeStatusFilter !== "all" && (r.trade.status ?? "") !== payTradeStatusFilter) return false;
      if (payPaymentStatusFilter.length && !payPaymentStatusFilter.includes(status)) return false;
      if (payDateFrom && (r.trade.trade_date ?? "") < payDateFrom) return false;
      if (payDateTo && (r.trade.trade_date ?? "") > payDateTo) return false;
      return true;
    });
  }, [payableRows, retroMap, payClientFilter, payIntroducerFilter, payIsinFilter, payTradeStatusFilter, payPaymentStatusFilter, payDateFrom, payDateTo]);

  const recvTotals = useMemo(() => {
    const totalByCcy = new Map<string, number>();
    const outstandingByCcy = new Map<string, number>();
    const paidByCcy = new Map<string, number>();
    let pendingCount = 0, paidCount = 0;
    for (const t of filteredReceivables) {
      const ccy = t.product?.currency ?? "?";
      const amt = Number(t.gross_fees ?? 0);
      totalByCcy.set(ccy, (totalByCcy.get(ccy) ?? 0) + amt);
      if (invoiceMap.get(t.id)?.payment_status === "paid") {
        paidByCcy.set(ccy, (paidByCcy.get(ccy) ?? 0) + amt);
        paidCount++;
      } else {
        outstandingByCcy.set(ccy, (outstandingByCcy.get(ccy) ?? 0) + amt);
        pendingCount++;
      }
    }
    return { totalByCcy, outstandingByCcy, paidByCcy, pendingCount, paidCount };
  }, [filteredReceivables, invoiceMap]);

  const payTotals = useMemo(() => {
    const owedByCcy = new Map<string, number>();
    const paidByCcy = new Map<string, number>();
    let owedCount = 0, paidCount = 0;
    for (const r of filteredPayableRows) {
      const status = retroMap.get(r.key)?.payment_status ?? "invoice_not_received";
      const ccy = r.trade.product?.currency ?? "?";
      const amt = Number(r.retroAmt ?? 0);
      if (status === "payment_approved") { paidByCcy.set(ccy, (paidByCcy.get(ccy) ?? 0) + amt); paidCount++; }
      else { owedByCcy.set(ccy, (owedByCcy.get(ccy) ?? 0) + amt); owedCount++; }
    }
    return { owedByCcy, paidByCcy, owedCount, paidCount };
  }, [filteredPayableRows, retroMap]);

  // Reset pages when filters change
  useEffect(() => { setReceivablesPage(0); }, [recvStatusFilter, recvIssuerFilter, recvCcyFilter, recvIsinFilter, recvTradeDateFrom, recvTradeDateTo, recvValueDateFrom, recvValueDateTo]);
  useEffect(() => { setPayablesPage(0); }, [payClientFilter, payIntroducerFilter, payIsinFilter, payTradeStatusFilter, payPaymentStatusFilter, payDateFrom, payDateTo]);

  const pagedReceivables = useMemo(
    () => filteredReceivables.slice(receivablesPage * PAGE_SIZE, (receivablesPage + 1) * PAGE_SIZE),
    [filteredReceivables, receivablesPage]
  );
  const pagedPayables = useMemo(
    () => filteredPayableRows.slice(payablesPage * PAGE_SIZE, (payablesPage + 1) * PAGE_SIZE),
    [filteredPayableRows, payablesPage]
  );

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function lookupDealerBilling(tradeId: string): Promise<{ billing: BillingRecord | null; name: string }> {
    const dealerName = dealerMap.get(tradeId) ?? "";
    if (!dealerName) return { billing: null, name: "" };
    const { data: cp } = await supabase.from("counterparties").select("id").eq("legal_name", dealerName).maybeSingle();
    if (!cp) return { billing: null, name: dealerName };
    const { data: billing } = await supabase.from("counterparty_billing").select("*").eq("counterparty_id", (cp as any).id).maybeSingle();
    return { billing: billing as BillingRecord | null, name: dealerName };
  }

  async function finalizeInvoice(
    trade: TradeRow,
    bankAccount: BankAccountRecord | null,
    dealerBilling: BillingRecord | null,
    dealerName: string
  ) {
    await generateInvoicePdf(trade, senderBilling, bankAccount, dealerBilling, dealerName, riverrockEntityName);

    // Track download
    const existing = invoiceMap.get(trade.id);
    const now = new Date().toISOString();
    if (existing) {
      await supabase.from("invoices").update({ downloaded_at: now }).eq("id", existing.id);
      setInvoiceMap((prev) => { const m = new Map(prev); m.set(trade.id, { ...existing, downloaded_at: now }); return m; });
    } else {
      const { data } = await supabase.from("invoices").insert({ trade_id: trade.id, downloaded_at: now, payment_status: "pending" }).select().single();
      if (data) setInvoiceMap((prev) => { const m = new Map(prev); m.set(trade.id, data as InvoiceRecord); return m; });
    }
  }

  async function handleGenerateInvoice(trade: TradeRow) {
    const ccy = trade.product?.currency ?? "";
    const accountsForCcy = senderBankAccounts.filter((a) => a.currency === ccy);
    const { billing: dealerBilling, name: dealerName } = await lookupDealerBilling(trade.id);

    if (accountsForCcy.length > 1) {
      // Show bank selection modal
      setPendingInvoice({ trade, dealerBilling, dealerName, accounts: accountsForCcy });
      setSelectedBankId(accountsForCcy[0]?.id ?? "");
    } else {
      await finalizeInvoice(trade, accountsForCcy[0] ?? null, dealerBilling, dealerName);
    }
  }

  async function confirmBankSelection() {
    if (!pendingInvoice) return;
    const bank = pendingInvoice.accounts.find((a) => a.id === selectedBankId) ?? null;
    await finalizeInvoice(pendingInvoice.trade, bank, pendingInvoice.dealerBilling, pendingInvoice.dealerName);
    setPendingInvoice(null);
  }

  async function togglePaymentStatus(trade: TradeRow) {
    const existing = invoiceMap.get(trade.id);
    const next: "pending" | "paid" = (existing?.payment_status ?? "pending") === "pending" ? "paid" : "pending";
    if (existing) {
      await supabase.from("invoices").update({ payment_status: next }).eq("id", existing.id);
      setInvoiceMap((prev) => { const m = new Map(prev); m.set(trade.id, { ...existing, payment_status: next }); return m; });
    } else {
      const { data } = await supabase.from("invoices").insert({ trade_id: trade.id, payment_status: next }).select().single();
      if (data) setInvoiceMap((prev) => { const m = new Map(prev); m.set(trade.id, data as InvoiceRecord); return m; });
    }
    showToast(`Invoice status → ${next}`);
  }

  async function updateRetroStatus(row: PayableRow, newStatus: RetroStatus) {
    const existing = retroMap.get(row.key);
    if (existing) {
      await supabase.from("retro_payments").update({ payment_status: newStatus }).eq("id", existing.id);
      setRetroMap((prev) => { const m = new Map(prev); m.set(row.key, { ...existing, payment_status: newStatus }); return m; });
    } else {
      const { data } = await supabase.from("retro_payments").insert({ trade_id: row.trade.id, recipient_type: row.recipientType, payment_status: newStatus }).select().single();
      if (data) setRetroMap((prev) => { const m = new Map(prev); m.set(row.key, data as RetroPaymentRecord); return m; });
    }
  }

  // ─── Render helpers ────────────────────────────────────────────────────────

  const tabBtn = (t: "receivables" | "payables", label: string) => (
    <button onClick={() => setTab(t)} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition ${tab === t ? "bg-[#002651] text-white shadow-sm" : "text-black/60 hover:bg-black/8"}`}>
      {label}
    </button>
  );

  const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
    <th className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-[#002651] text-white ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );

  const rowBg = (i: number) => i % 2 === 0 ? "bg-[#DEE7F0]/50" : "bg-white";

  const filterInput = (value: string, onChange: (v: string) => void, placeholder: string, width = "w-36") => (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`${width} rounded-xl border border-black/20 px-3 py-2 text-sm font-bold`} />
  );

  const dateInput = (value: string, onChange: (v: string) => void) => (
    <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold" />
  );

  if (loading) {
    return <div className="flex items-center justify-center h-48"><div className="text-sm text-black/40 font-medium">Loading invoicing data…</div></div>;
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9999] rounded-xl bg-black text-white px-5 py-2.5 text-sm font-bold shadow-xl">{toast}</div>}

      {/* Bank Account Selection Modal */}
      {pendingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-base font-bold">Select Bank Account</div>
                <div className="text-xs text-black/50 mt-0.5">Multiple {pendingInvoice.trade.product?.currency} accounts found</div>
              </div>
              <button onClick={() => setPendingInvoice(null)} className="rounded-lg p-1 hover:bg-black/5"><X className="h-5 w-5 text-black/40" /></button>
            </div>
            <div className="space-y-2">
              {pendingInvoice.accounts.map((a) => (
                <label key={a.id} className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition ${selectedBankId === a.id ? "border-[#002651] bg-blue-50" : "border-black/10 hover:border-black/20"}`}>
                  <input type="radio" name="bank" value={a.id} checked={selectedBankId === a.id} onChange={() => setSelectedBankId(a.id)} className="mt-0.5 accent-[#002651]" />
                  <div>
                    <div className="text-sm font-bold">{a.bank_name}</div>
                    {a.iban && <div className="text-xs text-black/50 mt-0.5">IBAN: {a.iban}</div>}
                    {a.account_number && <div className="text-xs text-black/50 mt-0.5">Acct: {a.account_number}{a.sort_code ? ` · Sort: ${a.sort_code}` : ""}</div>}
                    {a.bic && <div className="text-xs text-black/50">BIC: {a.bic}</div>}
                  </div>
                </label>
              ))}
            </div>
            <button onClick={confirmBankSelection} className="w-full rounded-xl bg-[#002651] text-white py-2.5 text-sm font-bold hover:opacity-95">
              Generate Invoice
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-black">Invoicing</h1>
        <p className="text-sm text-black/50 mt-0.5">Manage receivables and payables</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 p-1.5 bg-black/5 rounded-2xl w-fit">
        {tabBtn("receivables", "Receivables")}
        {tabBtn("payables", "Payables")}
      </div>

      {/* ══════════════════════════════════════════════════════════ */}
      {/* RECEIVABLES                                               */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === "receivables" && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <SummaryCard label="Total Gross Fees" sub={`${filteredReceivables.length} trade${filteredReceivables.length !== 1 ? "s" : ""}`} colorClass="border-black/8 bg-white text-black">
              <CcyBreakdown map={recvTotals.totalByCcy} />
            </SummaryCard>
            <SummaryCard label="Outstanding" sub={`${recvTotals.pendingCount} pending`} colorClass="border-amber-200 bg-amber-50 text-amber-700">
              <CcyBreakdown map={recvTotals.outstandingByCcy} />
            </SummaryCard>
            <SummaryCard label="Paid" sub={`${recvTotals.paidCount} invoices paid`} colorClass="border-emerald-200 bg-emerald-50 text-emerald-700">
              <CcyBreakdown map={recvTotals.paidByCcy} />
            </SummaryCard>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-black/8 bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              {filterInput(recvIsinFilter, setRecvIsinFilter, "Filter ISIN…")}
              <MultiSelectFilter label="Issuer" options={recvIssuerOptions} selected={recvIssuerFilter} onChange={setRecvIssuerFilter} />
              <MultiSelectFilter label="CCY" options={recvCcyOptions} selected={recvCcyFilter} onChange={setRecvCcyFilter} />
              <select value={recvStatusFilter} onChange={(e) => setRecvStatusFilter(e.target.value as "all" | "pending" | "paid")} className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold">
                <option value="all">All statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
              </select>
              {(recvIsinFilter || recvIssuerFilter.length || recvCcyFilter.length || recvStatusFilter !== "all" || recvTradeDateFrom || recvTradeDateTo || recvValueDateFrom || recvValueDateTo) && (
                <button onClick={() => { setRecvIsinFilter(""); setRecvIssuerFilter([]); setRecvCcyFilter([]); setRecvStatusFilter("all"); setRecvTradeDateFrom(""); setRecvTradeDateTo(""); setRecvValueDateFrom(""); setRecvValueDateTo(""); }} className="text-xs font-bold text-black/40 hover:text-black underline">Clear all</button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center text-xs font-bold text-black/50">
              <span>Trade Date</span>{dateInput(recvTradeDateFrom, setRecvTradeDateFrom)}<span className="text-black/30">→</span>{dateInput(recvTradeDateTo, setRecvTradeDateTo)}
              <span className="ml-3">Value Date</span>{dateInput(recvValueDateFrom, setRecvValueDateFrom)}<span className="text-black/30">→</span>{dateInput(recvValueDateTo, setRecvValueDateTo)}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-black/8 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <TH>Reference</TH>
                    <TH>Dealer</TH>
                    <TH>ISIN</TH>
                    <TH>Trade Date</TH>
                    <TH>Value Date</TH>
                    <TH>Trade Status</TH>
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
                    <tr><td colSpan={13} className="text-center py-14 text-black/30 text-sm">No receivables match your filters.</td></tr>
                  )}
                  {pagedReceivables.map((t, i) => {
                    const inv = invoiceMap.get(t.id);
                    const status = inv?.payment_status ?? "pending";
                    const downloaded = !!inv?.downloaded_at;
                    const dealer = dealerMap.get(t.id) ?? "—";
                    return (
                      <tr key={t.id} className={`border-t border-black/5 ${rowBg(i)} hover:bg-blue-50/60 transition-colors`}>
                        <td className="px-4 py-3 text-[12px] font-bold whitespace-nowrap">{t.reference ?? "—"}</td>
                        <td className="px-4 py-3 text-[12px] max-w-[160px] truncate" title={dealer}>{dealer}</td>
                        <td className="px-4 py-3 text-[12px] font-mono">{t.product?.isin ?? "—"}</td>
                        <td className="px-4 py-3 text-[12px] whitespace-nowrap">{formatDate(t.trade_date)}</td>
                        <td className="px-4 py-3 text-[12px] whitespace-nowrap">{formatDate(t.value_date)}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full text-[11px] font-bold px-2 py-0.5 ${t.status === "booked" ? "bg-emerald-100 text-emerald-700" : t.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {t.status ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] max-w-[180px] truncate" title={t.product?.product_name ?? ""}>{t.product?.product_name ?? "—"}</td>
                        <td className="px-4 py-3 text-[12px] font-bold">{t.product?.currency ?? "—"}</td>
                        <td className="px-4 py-3 text-[12px] text-right font-mono">{formatNumber(t.total_size)}</td>
                        <td className="px-4 py-3 text-[12px] text-right font-mono font-bold text-emerald-700">{formatNumber(t.gross_fees)}</td>
                        <td className="px-4 py-3">
                          {canTogglePayment
                            ? <button onClick={() => togglePaymentStatus(t)} title="Click to toggle"><InvoiceStatusBadge status={status} /></button>
                            : <InvoiceStatusBadge status={status} />}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {downloaded
                            ? <span title={`Downloaded ${formatDate(inv?.downloaded_at)}`} className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-600"><CheckCircle className="h-3.5 w-3.5" /></span>
                            : <span className="text-black/20 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleGenerateInvoice(t)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#002651] text-white px-3 py-1.5 text-[11px] font-bold hover:opacity-90 transition whitespace-nowrap">
                            <FileText className="h-3 w-3" />Invoice
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <PaginationBar page={receivablesPage} total={filteredReceivables.length} pageSize={PAGE_SIZE} label="trades" onPage={setReceivablesPage} />
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* PAYABLES                                                  */}
      {/* ══════════════════════════════════════════════════════════ */}
      {tab === "payables" && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <SummaryCard label="Total Retros Owed" sub={`${payTotals.owedCount} recipient${payTotals.owedCount !== 1 ? "s" : ""} · payment not yet approved`} colorClass="border-amber-200 bg-amber-50 text-amber-700">
              <CcyBreakdown map={payTotals.owedByCcy} />
            </SummaryCard>
            <SummaryCard label="Total Retros Paid" sub={`${payTotals.paidCount} recipient${payTotals.paidCount !== 1 ? "s" : ""} · payment approved`} colorClass="border-emerald-200 bg-emerald-50 text-emerald-700">
              <CcyBreakdown map={payTotals.paidByCcy} />
            </SummaryCard>
          </div>

          {/* Filters */}
          <div className="rounded-2xl border border-black/8 bg-white p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              {filterInput(payIsinFilter, setPayIsinFilter, "Filter ISIN…")}
              <MultiSelectFilter label="Client" options={payClientOptions} selected={payClientFilter} onChange={setPayClientFilter} searchable />
              <MultiSelectFilter label="Introducer" options={payIntroducerOptions} selected={payIntroducerFilter} onChange={setPayIntroducerFilter} searchable />
              <select value={payTradeStatusFilter} onChange={(e) => setPayTradeStatusFilter(e.target.value)} className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold">
                <option value="all">All trade statuses</option>
                <option value="pending">Pending</option>
                <option value="booked">Booked</option>
              </select>
              <MultiSelectFilter
                label="Payment Status"
                options={RETRO_STATUS_OPTIONS.map((o) => o.value)}
                selected={payPaymentStatusFilter}
                onChange={(v) => setPayPaymentStatusFilter(v as RetroStatus[])}
                labelMap={Object.fromEntries(RETRO_STATUS_OPTIONS.map((o) => [o.value, o.label]))}
              />
              <button onClick={() => exportPayablesToCsv(filteredPayableRows, retroMap)} className="inline-flex items-center gap-1.5 rounded-xl border border-black/20 bg-white px-3 py-2 text-sm font-bold hover:bg-black/5 transition">
                Export CSV
              </button>
              {(payIsinFilter || payClientFilter.length || payIntroducerFilter.length || payTradeStatusFilter !== "all" || payPaymentStatusFilter.length > 0 || payDateFrom || payDateTo) && (
                <button onClick={() => { setPayIsinFilter(""); setPayClientFilter([]); setPayIntroducerFilter([]); setPayTradeStatusFilter("all"); setPayPaymentStatusFilter([]); setPayDateFrom(""); setPayDateTo(""); }} className="text-xs font-bold text-black/40 hover:text-black underline">Clear all</button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center text-xs font-bold text-black/50">
              <span>Trade Date</span>{dateInput(payDateFrom, setPayDateFrom)}<span className="text-black/30">→</span>{dateInput(payDateTo, setPayDateTo)}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-black/8 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <TH>ISIN</TH><TH>Issue Date</TH><TH>Recipient Name</TH><TH>Recipient Type</TH>
                    <TH right>Size</TH><TH right>Retro %</TH><TH right>Retro Amt</TH>
                    <TH>Trade Status</TH><TH>Payment Status</TH>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayableRows.length === 0 && (
                    <tr><td colSpan={9} className="text-center py-14 text-black/30 text-sm">No payables match your filters.</td></tr>
                  )}
                  {pagedPayables.map((r, i) => {
                    const status = retroMap.get(r.key)?.payment_status ?? "invoice_not_received";
                    const ccy = r.trade.product?.currency ?? "";
                    const settlement = r.trade.product?.settlement;
                    const selectColorClass = RETRO_STATUS_OPTIONS.find((o) => o.value === status)?.selectColor ?? "border-black/20";
                    return (
                      <tr key={r.key} className={`border-t border-black/5 ${rowBg(i)} hover:bg-blue-50/60 transition-colors`}>
                        <td className="px-4 py-3 text-[12px] font-mono">{r.trade.product?.isin ?? "—"}</td>
                        <td className="px-4 py-3 text-[12px] whitespace-nowrap">{formatDate(r.trade.trade_date)}</td>
                        <td className="px-4 py-3 text-[12px] font-bold">{r.recipientName ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full text-[11px] font-bold px-2 py-0.5 ${r.recipientType === "client" ? "bg-blue-100 text-blue-700" : r.recipientType === "introducer" ? "bg-purple-100 text-purple-700" : "bg-orange-100 text-orange-700"}`}>
                            {r.recipientType === "client" ? "Client" : r.recipientType === "introducer" ? "Introducer" : "Custodian"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[12px] text-right font-mono">{formatNumber(r.trade.total_size)}</td>
                        <td className="px-4 py-3 text-[12px] text-right">
                          {r.retroPct !== null && r.retroPct !== undefined ? settlement === "percent" ? `${fmt2(r.retroPct)}%` : `${fmt2(r.retroPct)} ${ccy}/unit` : "—"}
                        </td>
                        <td className="px-4 py-3 text-[12px] text-right font-mono font-bold text-[#002651]">
                          {r.retroAmt !== null && r.retroAmt !== undefined ? `${formatNumber(r.retroAmt)} ${ccy}` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full text-[11px] font-bold px-2 py-0.5 ${r.trade.status === "booked" ? "bg-emerald-100 text-emerald-700" : r.trade.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                            {r.trade.status ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 min-w-[210px]">
                          {isAdmin ? (
                            <select value={status} onChange={(e) => updateRetroStatus(r, e.target.value as RetroStatus)} className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold w-full transition ${selectColorClass}`}>
                              {RETRO_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          ) : (
                            <span className={`inline-flex rounded-lg border px-2 py-1.5 text-[11px] font-bold ${selectColorClass}`}>
                              {RETRO_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <PaginationBar page={payablesPage} total={filteredPayableRows.length} pageSize={PAGE_SIZE} label="rows" onPage={setPayablesPage} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
