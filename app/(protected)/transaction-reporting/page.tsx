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
        .order("trade_date", { ascending: false })
        .order("reference", { ascending: true });

      if (error) {
        console.error(error);
        setRows([]);
        setLoading(false);
        return;
      }

      const loadedTrades = (trades ?? []) as TradeRow[];
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
    let missingCountry = 0;

    rows.forEach((t) => {
      if (!t.product?.isin) missingIsin++;
      if (!t.product?.maturity_date) missingMaturity++;
      if (!t.booking_timestamp) missingTimestamp++;

      const cps = counterparties[t.id] ?? [];
      cps.forEach((cp) => {
        if (!cp?.lei) missingLei++;
        if (!cp?.country_code) missingCountry++;
      });
    });

    return {
      missingIsin,
      missingMaturity,
      missingTimestamp,
      missingLei,
      missingCountry,
      totalIssues:
        missingIsin +
        missingMaturity +
        missingTimestamp +
        missingLei +
        missingCountry,
    };
  }, [rows, counterparties]);

  const health = useMemo(() => {
    let pending = 0;
    let overdue = 0;

    rows.forEach((t) => {
      const hasReport = !!reportLinks[t.id];
      if (!hasReport) {
        pending++;
        if (getUrgency(t.trade_date) === "overdue") {
          overdue++;
        }
      }
    });

    return { pending, overdue };
  }, [rows, reportLinks]);

  async function generate(tradeIds: string[]) {
    const res = await fetch("/api/mifid2/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeIds }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      alert(`HTTP ${res.status}: ${text}`);
      return;
    }

    const cd = res.headers.get("content-disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(cd);
    const filename = match?.[1] ?? "RiverRock.MiFIR.xlsx";

    const blob = await res.blob();
    downloadBlob(blob, filename);

    window.location.reload();
  }

  function toggleSelect(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  const selectedIds = useMemo(
    () => Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k),
    [selected]
  );

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm flex gap-8 text-sm">
        <div>
          <div className="text-black/60">Pending reports</div>
          <div className="font-bold">{health.pending}</div>
        </div>

        <div>
          <div className="text-black/60">Overdue</div>
          <div className="font-bold text-red-600">{health.overdue}</div>
        </div>

        <div>
          <div className="text-black/60">Validation issues</div>
          <div className="font-bold text-amber-600">{validation.totalIssues}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="text-lg font-semibold">MiFID II Transaction Reporting</div>

        <div className="text-sm text-gray-600 mt-1">
          Reportable trades must be exported in the MiFIR transaction reporting format and uploaded to your ARM within T+1 business day.
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            className={`px-3 py-2 rounded-lg border text-sm ${batchMode ? "bg-gray-900 text-white" : "bg-white"}`}
            onClick={() => {
              setBatchMode((b) => !b);
              setSelected({});
            }}
          >
            {batchMode ? "Batch Mode: ON" : "Batch Mode: OFF"}
          </button>

          <button
            className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm disabled:opacity-50"
            disabled={!batchMode || selectedIds.length < 2}
            onClick={() => generate(selectedIds)}
          >
            Generate Batch ({selectedIds.length})
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading reportable trades…</div>
      ) : (
        <>
          {validation.totalIssues > 0 && (
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
              <div className="font-semibold text-amber-800 mb-2">
                Validation warnings
              </div>

              <div className="space-y-1 text-amber-700">
                {validation.missingIsin > 0 && (
                  <div>⚠ {validation.missingIsin} trade(s) missing ISIN</div>
                )}

                {validation.missingMaturity > 0 && (
                  <div>⚠ {validation.missingMaturity} trade(s) missing maturity date</div>
                )}

                {validation.missingTimestamp > 0 && (
                  <div>⚠ {validation.missingTimestamp} trade(s) missing booking timestamp</div>
                )}

                {validation.missingLei > 0 && (
                  <div>⚠ {validation.missingLei} counterparties missing LEI</div>
                )}

                {validation.missingCountry > 0 && (
                  <div>⚠ {validation.missingCountry} counterparties missing country code</div>
                )}
              </div>
            </div>
          )}

          {grouped.map(([date, list]) => (
            <div
              key={date}
              className="rounded-2xl border border-black/10 bg-white shadow-sm"
            >
              <div className="px-4 py-3 border-b border-black/10 flex items-center justify-between bg-black/[0.02]">
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{date}</span>

                  {(() => {
                    const hasPending = list.some((t) => !reportLinks[t.id]);
                    if (!hasPending) return null;

                    const urgency = getUrgency(date);

                    if (urgency === "overdue") {
                      return (
                        <span className="text-xs font-semibold text-red-600">
                          Overdue
                        </span>
                      );
                    }

                    if (urgency === "due") {
                      return (
                        <span className="text-xs font-semibold text-amber-600">
                          Due today
                        </span>
                      );
                    }

                    return null;
                  })()}
                </div>

                <div className="text-xs text-gray-500">{list.length} trade(s)</div>
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
                        if (!cp?.country_code) issues.push("Missing country");
                      });

                      const hasIssues = issues.length > 0;
                      const rep = reportLinks[t.id] ?? null;

                      const status = rep
                        ? "Available"
                        : hasIssues
                          ? "Validation issues"
                          : "Pending";

                      return (
                        <tr
                          key={t.id}
                          className="border-t border-black/10 hover:bg-black/[0.02]"
                        >
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
                          <td className="px-3 py-2 text-center">{t.product?.product_name ?? "-"}</td>
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
                              title={hasIssues ? issues.join(", ") : "Download"}
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
        </>
      )}
    </div>
  );
}