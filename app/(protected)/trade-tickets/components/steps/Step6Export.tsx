"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Download, Image } from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import TicketTemplate from "../TicketTemplate";
import type { TradeLeg, ClientContact, AppUser, TicketRecord } from "../../types";

interface Props {
  leg: TradeLeg;
  contact: ClientContact;
  user: AppUser;
  onBack: () => void;
  onReset: () => void;
}

function fmtDateTime(iso: string) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function Step6Export({ leg, contact, user, onBack, onReset }: Props) {
  const [generating, setGenerating] = useState<"docx" | "pdf" | "png" | null>(null);
  const [history, setHistory] = useState<TicketRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const ticketRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHistory();
  }, [leg.id]);

  async function fetchHistory() {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/trade-tickets?legId=${leg.id}`);
      const data = await res.json();
      setHistory(Array.isArray(data) ? data : []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function getAuthToken(): Promise<string | null> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }

  async function handleDocxOrPdf(format: "docx" | "pdf") {
    setGenerating(format);
    try {
      const token = await getAuthToken();
      const res = await fetch("/api/trade-tickets/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ legId: leg.id, contactId: contact.id, format }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as any).error ?? "Generation failed");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const ref = leg.tradeRef.replace(/[^a-zA-Z0-9-]/g, "_");
      const a = document.createElement("a");
      a.href = url;
      a.download = `TradeTicket_${ref}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // Refresh history
      await fetchHistory();
    } catch (err) {
      alert("An error occurred during generation.");
    } finally {
      setGenerating(null);
    }
  }

  async function handlePng() {
    setGenerating("png");
    try {
      const el = ticketRef.current;
      if (!el) return;

      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(el, { pixelRatio: 2 });

      const ref = leg.tradeRef.replace(/[^a-zA-Z0-9-]/g, "_");
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `TradeTicket_${ref}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      // Log to DB
      const token = await getAuthToken();
      if (token) {
        await fetch("/api/trade-tickets/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ legId: leg.id, contactId: contact.id, format: "png", logOnly: true }),
        }).catch(() => {});
      }

      await fetchHistory();
    } catch {
      alert("PNG generation failed.");
    } finally {
      setGenerating(null);
    }
  }

  const formatBadge: Record<string, string> = {
    docx: "bg-blue-100 text-blue-700",
    pdf: "bg-red-100 text-red-700",
    png: "bg-purple-100 text-purple-700",
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Generate Trade Ticket</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Download the final ticket for{" "}
          <span className="font-medium text-gray-700">{leg.tradeRef}</span> — sent to{" "}
          <span className="font-medium text-gray-700">{contact.name}</span>
        </p>
      </div>

      {/* Three download buttons */}
      <div className="grid grid-cols-3 gap-3">
        {/* DOCX */}
        <button
          type="button"
          onClick={() => handleDocxOrPdf("docx")}
          disabled={!!generating}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-gray-200 py-5 px-3 hover:border-teal-400 hover:bg-teal-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating === "docx" ? (
            <Loader2 className="h-6 w-6 text-teal-500 animate-spin" />
          ) : (
            <FileText className="h-6 w-6 text-teal-600" />
          )}
          <span className="text-sm font-semibold text-gray-700">
            {generating === "docx" ? "Generating…" : "Download .docx"}
          </span>
        </button>

        {/* PDF */}
        <button
          type="button"
          onClick={() => handleDocxOrPdf("pdf")}
          disabled={!!generating}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-gray-200 py-5 px-3 hover:border-teal-400 hover:bg-teal-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating === "pdf" ? (
            <Loader2 className="h-6 w-6 text-teal-500 animate-spin" />
          ) : (
            <Download className="h-6 w-6 text-teal-600" />
          )}
          <span className="text-sm font-semibold text-gray-700">
            {generating === "pdf" ? "Generating…" : "Download .pdf"}
          </span>
        </button>

        {/* PNG */}
        <button
          type="button"
          onClick={handlePng}
          disabled={!!generating}
          className="flex flex-col items-center gap-2 rounded-xl border-2 border-gray-200 py-5 px-3 hover:border-teal-400 hover:bg-teal-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating === "png" ? (
            <Loader2 className="h-6 w-6 text-teal-500 animate-spin" />
          ) : (
            <Image className="h-6 w-6 text-teal-600" />
          )}
          <span className="text-sm font-semibold text-gray-700">
            {generating === "png" ? "Capturing…" : "Download .png"}
          </span>
        </button>
      </div>

      {/* Hidden ticket clone for PNG capture */}
      <div className="hidden">
        <TicketTemplate
          leg={leg}
          contact={contact}
          user={user}
          containerRef={ticketRef as React.RefObject<HTMLDivElement>}
        />
      </div>

      {/* History table */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Previously Generated
        </h3>
        {loadingHistory ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading history…
          </div>
        ) : history.length === 0 ? (
          <p className="text-sm text-gray-400">No tickets generated yet for this leg.</p>
        ) : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left font-semibold">Date</th>
                  <th className="px-3 py-2 text-left font-semibold">Format</th>
                  <th className="px-3 py-2 text-left font-semibold">Generated by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition">
                    <td className="px-3 py-2 text-gray-700">{fmtDateTime(r.createdAt)}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${formatBadge[r.format] ?? "bg-gray-100 text-gray-700"}`}>
                        {r.format}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{r.generatedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-lg bg-[#1A2A4A] py-2.5 text-sm font-semibold text-white hover:opacity-90 transition"
        >
          New Ticket
        </button>
      </div>
    </div>
  );
}
