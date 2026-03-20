"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, FileDown, ShieldAlert, X } from "lucide-react";
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
  arm_status: "pending" | "confirmed";
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
  const diff = Math.floor((today.getTime() - td.getTime()) / (1000 * 60 * 60 * 24));
  if (diff >= 2) return "overdue";
  if (diff === 1) return "due";
  return "ok";
}

function fmtSize(n: number | null): string {
  if (n == null) return "-";
  return n.toLocaleString("fr-CH").replace(/\s/g, "\u2019"); // Swiss apostrophe
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00"); // force local parse
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function TransactionReportingPage() {
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [reportLinks, setReportLinks] = useState<Record<string, { report: ReportLink["report"]; arm_status: "pending" | "confirmed" }>>({});
  const [counterparties, setCounterparties] = useState<Record<string, Counterparty[]>>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10; // date groups per page

  useEffect(() => {
    (async () => {
      setLoading(true);

      const { data: trades, error } = await supabase
        .from("trades")
        .select(`
          id, reference, trade_date, total_size, reportable, booking_timestamp,
          product:products(isin, product_name, currency, maturity_date)
        `)
        .eq("reportable", true)
        .order("trade_date", { ascending: false });

      if (error) { console.error(error); setLoading(false); return; }

      const loadedTrades: TradeRow[] = (trades ?? []).map((t: any) => ({
        id: t.id,
        reference: t.reference ?? null,
        trade_date: t.trade_date,
        total_size: t.total_size ?? null,
        reportable: t.reportable,
        booking_timestamp: t.booking_timestamp ?? null,
        product: Array.isArray(t.product) ? (t.product[0] ?? null) : (t.product ?? null),
      }));

      setRows(loadedTrades);

      const tradeIds = loadedTrades.map((t) => t.id);

      if (tradeIds.length) {
        const { data: links } = await supabase
          .from("mifid_report_trades")
          .select("trade_id, arm_status, report:mifid_reports(id, file_name, created_at, batch)")
          .in("trade_id", tradeIds);

        const reportMap: Record<string, { report: ReportLink["report"]; arm_status: "pending" | "confirmed" }> = {};
        (links ?? []).forEach((l: any) => {
          const rep = Array.isArray(l.report) ? (l.report[0] ?? null) : (l.report ?? null);
          reportMap[l.trade_id] = { report: rep, arm_status: l.arm_status ?? "pending" };
        });
        setReportLinks(reportMap);

        const { data: legs } = await supabase
          .from("trade_legs")
          .select("trade_id, counterparty:counterparty_id(lei, country_code)")
          .in("trade_id", tradeIds);

        const cpMap: Record<string, Counterparty[]> = {};
        (legs ?? []).forEach((l: any) => {
          if (!cpMap[l.trade_id]) cpMap[l.trade_id] = [];
          if (l.counterparty) cpMap[l.trade_id].push(l.counterparty);
        });
        setCounterparties(cpMap);

        // Auto-select yesterday's unreported trades
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const y = yesterday.toISOString().slice(0, 10);
        const auto: Record<string, boolean> = {};
        loadedTrades.forEach((t) => { if (t.trade_date === y && !reportMap[t.id]?.report) auto[t.id] = true; });
        setSelected(auto);
      }

      setLoading(false);
    })();
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<string, TradeRow[]>();
    rows.forEach((r) => {
      if (!m.has(r.trade_date)) m.set(r.trade_date, []);
      m.get(r.trade_date)!.push(r);
    });
    return Array.from(m.entries());
  }, [rows]);

  const totalPages = Math.ceil(grouped.length / PAGE_SIZE);
  const pagedGroups = grouped.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const validation = useMemo(() => {
    let missingIsin = 0, missingMaturity = 0, missingTimestamp = 0, missingLei = 0;
    rows.forEach((t) => {
      if (!t.product?.isin) missingIsin++;
      if (!t.product?.maturity_date) missingMaturity++;
      if (!t.booking_timestamp) missingTimestamp++;
      (counterparties[t.id] ?? []).forEach((cp) => { if (!cp?.lei) missingLei++; });
    });
    return { missingIsin, missingMaturity, missingTimestamp, missingLei,
      totalIssues: missingIsin + missingMaturity + missingTimestamp + missingLei };
  }, [rows, counterparties]);

  const health = useMemo(() => {
    let pending = 0, overdue = 0, created = 0, confirmed = 0;
    rows.forEach((t) => {
      const link = reportLinks[t.id];
      if (link?.report) {
        created++;
        if (link.arm_status === "confirmed") confirmed++;
      } else {
        pending++;
        if (getUrgency(t.trade_date) === "overdue") overdue++;
      }
    });
    return { pending, overdue, created, confirmed };
  }, [rows, reportLinks]);

  async function generate(tradeIds: string[]) {
    setGenerating(true);
    try {
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
    } finally {
      setGenerating(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  function clearSelection() {
    setSelected({});
  }

  async function updateArmStatus(tradeId: string, newStatus: "pending" | "confirmed") {
    const res = await fetch("/api/mifid2/arm-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeId, status: newStatus }),
    });
    if (!res.ok) {
      console.error("Failed to update ARM status:", await res.text());
      return;
    }
    setReportLinks((prev) => ({
      ...prev,
      [tradeId]: prev[tradeId] ? { ...prev[tradeId], arm_status: newStatus } : prev[tradeId],
    }));
  }

  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
  const allIds = rows.map((r) => r.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => !!selected[id]);

  return (
    <div className="p-8 space-y-8 pb-32">

      {/* PAGE TITLE */}
      <div>
        <h1 className="text-3xl font-bold">MiFID II Transaction Reporting</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Reportable trades must be exported in MiFIR format and uploaded to our ARM within T+1 business day.
        </p>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-4 gap-5">

        {/* Overdue — highest severity, shown first */}
        <div className={`rounded-xl border p-5 shadow-sm flex items-start gap-4 ${
          health.overdue > 0
            ? "bg-red-50 border-red-200"
            : "bg-white border-black/10"
        }`}>
          <div className={`mt-0.5 rounded-lg p-2 ${health.overdue > 0 ? "bg-red-100" : "bg-gray-100"}`}>
            <AlertTriangle size={18} className={health.overdue > 0 ? "text-red-600" : "text-gray-400"} />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Overdue</div>
            <div className={`text-2xl font-bold mt-0.5 ${health.overdue > 0 ? "text-red-600" : "text-gray-800"}`}>
              {health.overdue}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">Past T+1 deadline</div>
          </div>
        </div>

        {/* Pending */}
        <div className={`rounded-xl border p-5 shadow-sm flex items-start gap-4 ${
          health.pending > 0
            ? "bg-amber-50 border-amber-200"
            : "bg-white border-black/10"
        }`}>
          <div className={`mt-0.5 rounded-lg p-2 ${health.pending > 0 ? "bg-amber-100" : "bg-gray-100"}`}>
            <Clock size={18} className={health.pending > 0 ? "text-amber-600" : "text-gray-400"} />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Pending reports</div>
            <div className={`text-2xl font-bold mt-0.5 ${health.pending > 0 ? "text-amber-700" : "text-gray-800"}`}>
              {health.pending}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">Awaiting production</div>
          </div>
        </div>

        {/* Validation issues */}
        <div className={`rounded-xl border p-5 shadow-sm flex items-start gap-4 ${
          validation.totalIssues > 0
            ? "bg-orange-50 border-orange-200"
            : "bg-white border-black/10"
        }`}>
          <div className={`mt-0.5 rounded-lg p-2 ${validation.totalIssues > 0 ? "bg-orange-100" : "bg-gray-100"}`}>
            <ShieldAlert size={18} className={validation.totalIssues > 0 ? "text-orange-600" : "text-gray-400"} />
          </div>
          <div>
            <div className="text-xs text-gray-500 font-medium">Validation issues</div>
            <div className={`text-2xl font-bold mt-0.5 ${validation.totalIssues > 0 ? "text-orange-600" : "text-gray-800"}`}>
              {validation.totalIssues}
            </div>
            <div className="text-[11px] text-gray-400 mt-0.5">Missing fields</div>
          </div>
        </div>

        {/* Reports created */}
        {(() => {
          const allConfirmed = health.created > 0 && health.confirmed === health.created;
          return (
            <div className={`rounded-xl border p-5 shadow-sm flex items-start gap-4 ${
              allConfirmed ? "bg-emerald-50 border-emerald-200" : health.created > 0 ? "bg-yellow-50 border-yellow-200" : "bg-white border-black/10"
            }`}>
              <div className={`mt-0.5 rounded-lg p-2 ${allConfirmed ? "bg-emerald-100" : health.created > 0 ? "bg-yellow-100" : "bg-gray-100"}`}>
                <CheckCircle2 size={18} className={allConfirmed ? "text-emerald-600" : health.created > 0 ? "text-yellow-600" : "text-gray-400"} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 font-medium">Reports generated</div>
                <div className={`text-2xl font-bold mt-0.5 ${allConfirmed ? "text-emerald-700" : health.created > 0 ? "text-yellow-700" : "text-gray-800"}`}>
                  {health.created}
                </div>
                {health.created > 0 ? (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <div className={`flex-1 h-1.5 rounded-full overflow-hidden ${allConfirmed ? "bg-emerald-200" : "bg-yellow-200"}`}>
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${allConfirmed ? "bg-emerald-500" : "bg-yellow-500"}`}
                        style={{ width: `${Math.round((health.confirmed / health.created) * 100)}%` }}
                      />
                    </div>
                    <span className={`text-[11px] font-semibold whitespace-nowrap ${allConfirmed ? "text-emerald-700" : "text-yellow-700"}`}>
                      {health.confirmed}/{health.created} ARM confirmed
                    </span>
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-400 mt-0.5">No reports yet</div>
                )}
              </div>
            </div>
          );
        })()}

      </div>

      {/* SELECT ALL ACROSS ALL GROUPS */}
      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">{rows.length} reportable trade{rows.length !== 1 ? "s" : ""} total</span>
          <button
            onClick={() => {
              if (allSelected) {
                setSelected({});
              } else {
                const next: Record<string, boolean> = {};
                rows.forEach((r) => { next[r.id] = true; });
                setSelected(next);
              }
            }}
            className="text-xs text-[#2E5FA3] font-semibold hover:underline"
          >
            {allSelected ? "Deselect all trades" : "Select all trades"}
          </button>
        </div>
      )}

      {/* TABLES */}
      {loading ? (
        <div className="text-sm text-gray-500">Loading...</div>
      ) : grouped.length === 0 ? (
        <div className="text-sm text-gray-500">No reportable trades found.</div>
      ) : pagedGroups.map(([date, list]) => {
        const pendingTrades = list.filter((t) => !reportLinks[t.id]?.report);
        const urgency = pendingTrades.length > 0 ? getUrgency(date) : "ok";
        const allGroupSelected = list.every((t) => !!selected[t.id]);

        return (
          <div key={date} className="rounded-xl border border-black/10 bg-white shadow-sm">
            <div className="px-4 py-3 border-b border-black/10 flex justify-between items-center bg-black/[0.02]">
              <div className="font-semibold flex items-center gap-2">
                {fmtDate(date)}
                {urgency === "overdue" && pendingTrades.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-red-600 text-xs font-semibold">
                    <AlertTriangle size={11} /> Overdue
                  </span>
                )}
                {urgency === "due" && pendingTrades.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-semibold">
                    <Clock size={11} /> Due today
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const next = { ...selected };
                    list.forEach((t) => { next[t.id] = !allGroupSelected; });
                    setSelected(next);
                  }}
                  className="text-xs text-[#2E5FA3] font-semibold hover:underline"
                >
                  {allGroupSelected ? "Deselect all" : "Select all"}
                </button>
                <span className="text-xs text-gray-500">{list.length} trade{list.length !== 1 ? "s" : ""}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-xs font-normal">
                <colgroup>
                  <col className="w-9" />
                  <col className="w-28" />
                  <col className="w-32" />
                  <col />
                  <col className="w-24" />
                  <col className="w-36" />
                  <col className="w-40" />
                  <col className="w-48" />
                  <col className="w-24" />
                </colgroup>
                <thead className="bg-[#002651] text-white">
                  <tr>
                    <th className="px-3 py-3"></th>
                    <th className="px-3 py-3 text-left">Reference</th>
                    <th className="px-3 py-3 text-left">ISIN</th>
                    <th className="px-3 py-3 text-left">Product</th>
                    <th className="px-3 py-3 text-right">Size</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-3 py-3 text-center">Timestamp</th>
                    <th className="px-3 py-3 text-center">ARM Feedback</th>
                    <th className="px-3 py-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((t) => {
                    const issues: string[] = [];
                    if (!t.product?.isin) issues.push("Missing ISIN");
                    if (!t.product?.maturity_date) issues.push("Missing maturity");
                    if (!t.booking_timestamp) issues.push("Missing timestamp");
                    (counterparties[t.id] ?? []).forEach((cp) => { if (!cp?.lei) issues.push("Missing LEI"); });
                    const hasIssues = issues.length > 0;
                    const link = reportLinks[t.id] ?? null;
                    const rep = link?.report ?? null;
                    const armStatus = link?.arm_status ?? "pending";
                    const status = rep ? "Generated" : hasIssues ? "Validation issues" : "Pending";
                    const isSelected = !!selected[t.id];

                    return (
                      <tr
                        key={t.id}
                        onClick={() => toggleSelect(t.id)}
                        className={`border-t border-black/10 cursor-pointer transition-colors ${isSelected ? "bg-[#EBF0F8]" : "hover:bg-black/[0.02]"}`}
                      >
                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(t.id)}
                            className="accent-[#2E5FA3] w-3.5 h-3.5 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2.5 font-bold">{t.reference ?? "-"}</td>
                        <td className="px-3 py-2.5 font-mono">{t.product?.isin ?? "-"}</td>
                        <td className="px-3 py-2.5">{t.product?.product_name ?? "-"}</td>
                        <td className="px-3 py-2.5 text-right font-bold tabular-nums">{fmtSize(t.total_size)}</td>
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span
                              className={`inline-flex items-center justify-center min-w-[120px] px-2 py-1 text-xs border rounded-full font-bold ${
                                status === "Generated" ? "bg-green-50 border-green-200 text-green-700"
                                : status === "Validation issues" ? "bg-red-50 border-red-200 text-red-700"
                                : "bg-amber-50 border-amber-200 text-amber-700"
                              }`}
                            >
                              {status}
                            </span>
                            {hasIssues && (
                              <span className="text-[10px] text-red-500 leading-tight">
                                {issues.map((i) => i.replace("Missing ", "")).join(" · ")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-black/60 text-center">
                          {rep?.created_at ? new Date(rep.created_at).toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                          {rep ? (
                            armStatus === "confirmed" ? (
                              <div className="inline-flex items-center gap-1.5 group/arm">
                                <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-300 text-emerald-700 rounded-lg px-2 py-1 text-[11px] font-bold whitespace-nowrap">
                                  <CheckCircle2 size={10} /> Confirmed
                                </span>
                                <button
                                  onClick={() => {
                                    if (window.confirm("Revert ARM status to Pending? This should only be done if the confirmation was recorded in error.")) {
                                      updateArmStatus(t.id, "pending");
                                    }
                                  }}
                                  className="text-[10px] text-gray-300 hover:text-red-500 transition underline opacity-0 group-hover/arm:opacity-100 whitespace-nowrap"
                                >
                                  revert
                                </button>
                              </div>
                            ) : (
                              <select
                                value="pending"
                                onChange={(e) => {
                                  if (e.target.value === "confirmed") updateArmStatus(t.id, "confirmed");
                                }}
                                className="rounded-lg border bg-amber-50 border-amber-300 text-amber-700 px-2 py-1 text-[11px] font-bold transition cursor-pointer"
                              >
                                <option value="pending">Pending</option>
                                <option value="confirmed">Confirmed</option>
                              </select>
                            )
                          ) : (
                            <span className="text-black/25 text-[11px]">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <button
                            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                              hasIssues
                                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                                : "bg-[#002651] text-white hover:opacity-90"
                            }`}
                            onClick={() => { if (!hasIssues) generate([t.id]); }}
                            disabled={hasIssues}
                          >
                            Generate
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-gray-500">
            Showing dates {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, grouped.length)} of {grouped.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-black/10 bg-white hover:bg-black/[0.03] disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              ← Previous
            </button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                className={`w-7 h-7 text-xs font-semibold rounded-lg transition ${
                  i === page
                    ? "bg-[#1A2A4A] text-white"
                    : "border border-black/10 bg-white hover:bg-black/[0.03] text-gray-600"
                }`}
              >
                {i + 1}
              </button>
            ))}
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-black/10 bg-white hover:bg-black/[0.03] disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* FLOATING SELECTION ACTION BAR */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        selectedIds.length > 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}>
        <div className="flex items-center gap-4 bg-[#1A2A4A] text-white rounded-2xl shadow-2xl px-5 py-3.5">
          <span className="text-sm font-semibold">
            {selectedIds.length} trade{selectedIds.length !== 1 ? "s" : ""} selected
          </span>
          <div className="w-px h-4 bg-white/20" />
          <button
            onClick={clearSelection}
            className="flex items-center gap-1.5 text-sm text-white/60 hover:text-white transition"
          >
            <X size={14} />
            Clear
          </button>
          <button
            onClick={() => generate(selectedIds)}
            disabled={generating}
            className="flex items-center gap-2 bg-[#2E5FA3] hover:bg-[#2E5FA3]/90 disabled:opacity-60 text-white text-sm font-bold px-4 py-2 rounded-xl transition"
          >
            <FileDown size={15} />
            {generating ? "Generating…" : "Generate Transactions Report"}
          </button>
        </div>
      </div>

    </div>
  );
}
