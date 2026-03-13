"use client";

import { useEffect, useRef, useState } from "react";
import { Search, ChevronRight, Loader2 } from "lucide-react";
import type { SearchTrade, SearchLeg, TradeLeg, BookingEntity } from "../../types";

interface Props {
  onSelectLeg: (leg: TradeLeg) => void;
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function resolveBookingEntity(name: string): BookingEntity {
  return name.toLowerCase().includes("valeur")
    ? "Valeur Securities AG, Switzerland"
    : "RiverRock Securities SAS, France";
}

export default function Step1Search({ onSelectLeg }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/trades?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  async function handleLegClick(trade: SearchTrade, leg: SearchLeg) {
    // Fetch full leg data from the generate helper via a lightweight endpoint
    // We re-use the trade search data to build a TradeLeg shell; the API will resolve it fully
    // For now, we POST to a minimal endpoint, but here we build from the search result directly.
    // Full data will be resolved server-side in Step 6 generate.
    // For Step 2 preview, we need to fetch the full leg from the search API extended result.
    const res = await fetch(`/api/trades/${leg.legId}`);
    if (!res.ok) return;
    const fullLeg: TradeLeg = await res.json();
    onSelectLeg(fullLeg);
  }

  const legDirectionLabel = (dir: "buy" | "sell") =>
    dir === "sell" ? "YOU BUY" : "YOU SELL";
  const legDirectionClass = (dir: "buy" | "sell") =>
    dir === "sell"
      ? "bg-green-100 text-green-700"
      : "bg-red-100 text-red-700";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Search for a Trade</h2>
        <p className="text-sm text-gray-500 mt-0.5">Enter an ISIN or trade reference to find a trade</p>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ISIN or trade reference…"
          className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-4 py-2.5 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100 transition"
          autoFocus
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-teal-500 animate-spin" />
        )}
      </div>

      {/* Results */}
      {query.trim().length >= 2 && !loading && results.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
          <Search className="h-8 w-8" />
          <p className="text-sm">No trades found</p>
        </div>
      )}

      {query.trim().length < 2 && (
        <div className="flex flex-col items-center gap-2 py-12 text-gray-300">
          <Search className="h-10 w-10" />
          <p className="text-sm text-gray-400">Search by ISIN or trade reference</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden divide-y divide-gray-100">
          {results.map((trade) => (
            <div key={trade.tradeId}>
              {/* Trade header row */}
              <button
                type="button"
                onClick={() =>
                  setExpandedTradeId(
                    expandedTradeId === trade.tradeId ? null : trade.tradeId
                  )
                }
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition text-sm"
              >
                <ChevronRight
                  className={[
                    "h-4 w-4 text-gray-400 shrink-0 transition-transform",
                    expandedTradeId === trade.tradeId ? "rotate-90" : "",
                  ].join(" ")}
                />
                <span className="font-mono text-xs text-gray-500 w-28 shrink-0">{trade.tradeRef}</span>
                <span className="font-mono text-xs text-gray-700 w-24 shrink-0">{trade.isin}</span>
                <span className="flex-1 text-gray-800 font-medium truncate">{trade.productName}</span>
                <span className="text-gray-400 text-xs shrink-0">{fmtDate(trade.tradeDate)}</span>
                <span className="text-gray-500 text-xs shrink-0 max-w-[120px] truncate">{trade.clientName}</span>
              </button>

              {/* Legs sub-list */}
              {expandedTradeId === trade.tradeId && (
                <div className="bg-gray-50 divide-y divide-gray-100 border-t border-gray-100">
                  {trade.legs.map((leg) => (
                    <button
                      key={leg.legId}
                      type="button"
                      onClick={() => handleLegClick(trade, leg)}
                      className="w-full flex items-center gap-3 px-8 py-2.5 text-left hover:bg-teal-50 transition text-sm group"
                    >
                      <span
                        className={[
                          "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0",
                          legDirectionClass(leg.direction),
                        ].join(" ")}
                      >
                        {legDirectionLabel(leg.direction)}
                      </span>
                      <span className="text-gray-700 flex-1 truncate">{leg.counterpartyName}</span>
                      <span className="text-gray-400 text-xs shrink-0">
                        {leg.size != null ? leg.size.toLocaleString("en-CH") : "—"}
                      </span>
                      <span
                        className={[
                          "text-[10px] px-1.5 py-0.5 rounded capitalize shrink-0",
                          leg.status === "booked" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700",
                        ].join(" ")}
                      >
                        {leg.status}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 text-gray-300 group-hover:text-teal-400 transition shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
