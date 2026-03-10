"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";

type TradeRow = {
  id: string;
  reference: string | null;
  trade_date: string;
  total_size: number | null;
  reportable: boolean;
  booking_timestamp: string | null;
  product: {
    isin: string | null;
    product_name: string | null;
    currency: string | null;
    maturity_date: string | null;
  } | null;
};

type Counterparty = {
  lei: string | null;
  country_code: string | null;
};

type ReportLink = {
  trade_id: string;
  report: { id: string; file_name: string; created_at: string; batch: boolean } | null;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getUrgency(tradeDate: string) {
  const today = new Date();
  const td = new Date(tradeDate);

  const diff = Math.floor(
    (today.getTime() - td.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diff >= 2) return "overdue";
  if (diff === 1) return "due";
  return "ok";
}

export default function TransactionReportingPage() {
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [reportLinks, setReportLinks] = useState<Record<string, ReportLink["report"]>>({});
  const [counterparties, setCounterparties] = useState<Record<string, Counterparty[]>>({});
  const [loading, setLoading] = useState(true);

  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: trades, error } = await supabase
        .from("trades")
        .select(`
          id,
          reference,
          trade_date,
          total_size,
          reportable,
          booking_timestamp,
          product:products(
            isin,
            product_name,
            currency,
            maturity_date
          )
        `)
        .eq("reportable", true)
        .order("trade_date", { ascending: false });

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      const loadedTrades: TradeRow[] = (trades ?? []).map((t: any) => ({
        id: t.id,
        reference: t.reference ?? null,
        trade_date: t.trade_date,
        total_size: t.total_size ?? null,
        reportable: t.reportable,
        booking_timestamp: t.booking_timestamp ?? null,
        product: Array.isArray(t.product)
          ? (t.product[0] ?? null)
          : (t.product ?? null),
      }));

      setRows(loadedTrades);

      const tradeIds = loadedTrades.map((t) => t.id);

      if (tradeIds.length) {
        const { data: links } = await supabase
          .from("mifid_report_trades")
          .select(`
            trade_id,
            report:mifid_reports(id, file_name, created_at, batch)
          `)
          .in("trade_id", tradeIds);

        const reportMap: Record<string, ReportLink["report"]> = {};
        (links ?? []).forEach((l: any) => {
          reportMap[l.trade_id] = l.report ?? null;
        });

        setReportLinks(reportMap);

        const { data: legs } = await supabase
          .from("trade_legs")
          .select(`
            trade_id,
            counterparty:counterparty_id(
              lei,
              country_code
            )
          `)
          .in("trade_id", tradeIds);

        const cpMap: Record<string, Counterparty[]> = {};

        (legs ?? []).forEach((l: any) => {
          if (!cpMap[l.trade_id]) cpMap[l.trade_id] = [];
          if (l.counterparty) cpMap[l.trade_id].push(l.counterparty);
        });

        setCounterparties(cpMap);

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const y = yesterday.toISOString().slice(0, 10);

        const auto: Record<string, boolean> = {};

        loadedTrades.forEach((t) => {
          if (t.trade_date === y && !reportMap[t.id]) {
            auto[t.id] = true;
          }
        });

        setSelected(auto);
      }

      setLoading(false);
    })();
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, TradeRow[]>();
    rows.forEach((r) => {
      const key = r.trade_date;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    });
    return Array.from(m.entries());
  }, [rows]);

  const validation = useMemo(() => {
    let missingIsin = 0;
    let missingMaturity = 0;
    let missingTimestamp = 0;
    let missingLei = 0;

    rows.forEach((t) => {
      if (!t.product?.isin) missingIsin++;
      if (!t.product?.maturity_date) missingMaturity++;
      if (!t.booking_timestamp) missingTimestamp++;

      const cps = counterparties[t.id] ?? [];

      cps.forEach((cp) => {
        if (!cp?.lei) missingLei++;
      });
    });

    return {
      missingIsin,
      missingMaturity,
      missingTimestamp,
      missingLei,
      totalIssues:
        missingIsin +
        missingMaturity +
        missingTimestamp +
        missingLei,
    };
  }, [rows, counterparties]);

  const health = useMemo(() => {
    let pending = 0;
    let overdue = 0;
    let created = 0;

    rows.forEach((t) => {
      const hasReport = !!reportLinks[t.id];

      if (hasReport) created++;

      if (!hasReport) {
        pending++;

        if (getUrgency(t.trade_date) === "overdue") overdue++;
      }
    });

    return { pending, overdue, created };
  }, [rows, reportLinks]);

  async function generate(tradeIds: string[]) {
    const res = await fetch("/api/mifid2/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeIds }),
    });

    const cd = res.headers.get("content-disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(cd);
    const filename = match?.[1] ?? "MiFIR.xlsx";

    const blob = await res.blob();
    downloadBlob(blob, filename);

    window.location.reload();
  }

  function toggleSelect(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  const selectedIds = Object.entries(selected)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <div className="p-8 space-y-8">

      {/* PAGE TITLE */}

      <div>
        <h1 className="text-3xl font-bold">
          MiFID II Transaction Reporting
        </h1>

        <p className="text-gray-500 mt-1">
          Reportable trades must be exported in the MiFIR transaction reporting
          format and uploaded to your ARM within T+1 business day.
        </p>
      </div>

      {/* KPI CARDS */}

      <div className="grid grid-cols-4 gap-6">

        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="text-xs text-gray-500">Pending reports</div>
          <div className="text-2xl font-bold mt-1">{health.pending}</div>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="text-xs text-gray-500">Overdue</div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {health.overdue}
          </div>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="text-xs text-gray-500">Validation issues</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">
            {validation.totalIssues}
          </div>
        </div>

        <div className="rounded-xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="text-xs text-gray-500">Reports created</div>
          <div className="text-2xl font-bold mt-1">
            {health.created}
          </div>
        </div>

      </div>

      {/* BATCH ACTIONS */}

<div className="grid grid-cols-2 gap-6 max-w-xl">

<button
onClick={() => setBatchMode((b) => !b)}
className="flex items-center justify-between rounded-xl border border-black/10 bg-white p-4 hover:shadow-sm transition"
>

<div className="flex items-center gap-3">

<div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
💡
</div>

<div>
<div className="font-semibold">
Batch Mode
</div>

<div className="text-sm text-gray-500">
{batchMode ? "Disable batch selection" : "Enable batch selection"}
</div>

</div>

</div>

</button>

<button
disabled={!batchMode || selectedIds.length < 2}
onClick={() => generate(selectedIds)}
className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 hover:shadow-sm transition disabled:opacity-40"
>

<div className="flex items-center gap-3">

<div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
⬇
</div>

<div>
<div className="font-semibold text-emerald-700">
Generate Batch
</div>

<div className="text-sm text-emerald-600">
{selectedIds.length} trades selected
</div>

</div>

</div>

</button>

</div>

      {/* TABLES */}

      {grouped.map(([date, list]) => (
        <div key={date} className="rounded-xl border border-black/10 bg-white shadow-sm">

          <div className="px-4 py-3 border-b border-black/10 flex justify-between bg-black/[0.02]">
            <div className="font-semibold flex gap-2">
              {date}

              {getUrgency(date) === "overdue" && (
                <span className="text-red-600 text-xs font-semibold">
                  Overdue
                </span>
              )}
            </div>

            <div className="text-xs text-gray-500">
              {list.length} trade(s)
            </div>
          </div>

          <div className="overflow-x-auto">
<table className="min-w-full text-xs font-normal">
<thead className="bg-[#002651] text-white">
<tr>
{batchMode && <th className="px-3 py-3">Select</th>}
<th className="px-3 py-3 text-left">Reference</th>
<th className="px-3 py-3 text-left">ISIN</th>
<th className="px-3 py-3 text-left">Product</th>
<th className="px-3 py-3 text-right">Size</th>
<th className="px-3 py-3 text-center">Status</th>
<th className="px-3 py-3 text-center">Created</th>
<th className="px-3 py-3 text-right">Actions</th>
</tr>
</thead>

<tbody>
{list.map((t) => {

const issues: string[] = [];

if (!t.product?.isin) issues.push("Missing ISIN");
if (!t.product?.maturity_date) issues.push("Missing maturity");
if (!t.booking_timestamp) issues.push("Missing timestamp");

const cps = counterparties[t.id] ?? [];

cps.forEach((cp) => {
if (!cp?.lei) issues.push("Missing LEI");
});

const hasIssues = issues.length > 0;
const rep = reportLinks[t.id] ?? null;

const status = rep
? "Available"
: hasIssues
? "Validation issues"
: "Pending";

return (
<tr key={t.id} className="border-t border-black/10 hover:bg-black/[0.02]">

{batchMode && (
<td className="px-3 py-2 text-center">
<input
type="checkbox"
checked={!!selected[t.id]}
onChange={() => toggleSelect(t.id)}
/>
</td>
)}

<td className="px-3 py-2 font-bold">{t.reference ?? "-"}</td>

<td className="px-3 py-2 font-mono">{t.product?.isin ?? "-"}</td>

<td className="px-3 py-2">{t.product?.product_name ?? "-"}</td>

<td className="px-3 py-2 text-right font-bold">{t.total_size ?? "-"}</td>

<td className="px-3 py-2 text-center">

<span
className={`inline-flex items-center justify-center min-w-[120px] px-2 py-1 text-xs border rounded-full font-bold ${
status === "Available"
? "bg-green-50 border-green-200 text-green-700"
: status === "Validation issues"
? "bg-red-50 border-red-200 text-red-700"
: "bg-amber-50 border-amber-200 text-amber-700"
}`}
title={hasIssues ? issues.join(", ") : undefined}
>

{status}

</span>

</td>

<td className="px-3 py-2 text-xs text-black/60 text-center">

{rep?.created_at
? new Date(rep.created_at).toLocaleString()
: "-"}

</td>

<td className="px-3 py-2 text-right">

<button
className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
hasIssues
? "bg-gray-300 text-gray-500 cursor-not-allowed"
: "bg-[#002651] text-white hover:opacity-95"
}`}
onClick={() => {
if (hasIssues) return;
generate([t.id]);
}}
disabled={hasIssues}
>

Download

</button>

</td>

</tr>
);
})}
</tbody>
</table>
</div>

        </div>
      ))}

    </div>
  );
}