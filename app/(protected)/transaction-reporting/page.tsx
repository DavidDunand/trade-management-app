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
  product: { isin: string; product_name: string; currency: string } | null;
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

export default function TransactionReportingPage() {
  const [rows, setRows] = useState<TradeRow[]>([]);
  const [reportLinks, setReportLinks] = useState<Record<string, ReportLink["report"]>>({});
  const [loading, setLoading] = useState(true);

  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);

      // Trades: reportable only
      const { data: trades, error } = await supabase
        .from("trades")
        .select(`
          id, reference, trade_date, total_size, reportable,
          product:products(isin, product_name, currency)
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

      setRows((trades ?? []) as any);

      // Fetch report mappings for status pills
      const tradeIds = (trades ?? []).map((t: any) => t.id);
      if (tradeIds.length) {
        const { data: links, error: linkErr } = await supabase
          .from("mifid_report_trades")
          .select(`
            trade_id,
            report:mifid_reports(id, file_name, created_at, batch)
          `)
          .in("trade_id", tradeIds);

        if (!linkErr) {
          const map: Record<string, any> = {};
          (links ?? []).forEach((l: any) => {
            map[l.trade_id] = l.report ?? null;
          });
          setReportLinks(map);
        }
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

  async function generate(tradeIds: string[]) {
    const res = await fetch("/api/mifid2/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeIds }),
    });

if (!res.ok) {
  const text = await res.text().catch(() => "");
  let msg = `HTTP ${res.status}`;
  try {
    const j = JSON.parse(text);
    msg = j.error ? `${msg}: ${j.error}` : `${msg}: ${text}`;
  } catch {
    msg = text ? `${msg}: ${text}` : msg;
  }
  alert(msg);
  console.error("MiFID report error:", msg);
  return;
}

    const cd = res.headers.get("content-disposition") ?? "";
    const match = /filename="([^"]+)"/.exec(cd);
    const filename = match?.[1] ?? "RiverRock.MiFIR.xlsx";

    const blob = await res.blob();
    downloadBlob(blob, filename);

    // Refresh status pills quickly (cheap approach: reload page)
    window.location.reload();
  }

  function toggleSelect(id: string) {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  }

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected]
  );

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-xl border bg-white p-5">
        <div className="text-lg font-semibold">MiFID II Transaction Reporting</div>
        <div className="text-sm text-gray-600 mt-1">
          Reportable trades must be exported in the MiFIR transaction reporting format and uploaded to your ARM within T+1 business day.
        </div>
        <div className="text-sm text-gray-600 mt-2">
          ESMA guidelines:{" "}
          <a
            className="text-blue-600 hover:underline"
            href="https://www.esma.europa.eu/sites/default/files/library/2016-1452_guidelines_mifid_ii_transaction_reporting.pdf"
            target="_blank"
            rel="noreferrer"
          >
            2016-1452
          </a>
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

          <div className="text-xs text-gray-500">
            Batch file name includes first/last refs (sorted).
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading reportable trades…</div>
      ) : grouped.length === 0 ? (
        <div className="text-sm text-gray-500">No reportable trades found.</div>
      ) : (
        grouped.map(([date, list]) => (
          <div key={date} className="rounded-xl border bg-white">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <div className="font-semibold">{date}</div>
              <div className="text-xs text-gray-500">{list.length} trade(s)</div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    {batchMode && <th className="px-3 py-2 text-left">Select</th>}
                    <th className="px-3 py-2 text-left">Reference</th>
                    <th className="px-3 py-2 text-left">ISIN</th>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-right">Size</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Created</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((t) => {
                    const rep = reportLinks[t.id] ?? null;
                    const status = rep ? "Available" : "Pending";
                    return (
                      <tr key={t.id} className="border-t">
                        {batchMode && (
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={!!selected[t.id]}
                              onChange={() => toggleSelect(t.id)}
                            />
                          </td>
                        )}
                        <td className="px-3 py-2 font-medium">{t.reference ?? "-"}</td>
                        <td className="px-3 py-2">{t.product?.isin ?? "-"}</td>
                        <td className="px-3 py-2">{t.product?.product_name ?? "-"}</td>
                        <td className="px-3 py-2 text-right">{t.total_size ?? "-"}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs border ${
                              rep ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"
                            }`}
                          >
                            {status}{rep?.batch ? " (Batch)" : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600">
                          {rep?.created_at ? new Date(rep.created_at).toLocaleString() : "-"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs"
                            onClick={() => generate([t.id])}
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
        ))
      )}
    </div>
  );
}