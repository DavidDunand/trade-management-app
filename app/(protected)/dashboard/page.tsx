"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { supabase } from "@/src/lib/supabase";
import {
  TrendingUp,
  ListChecks,
  Hourglass,
  DivideSquare,
  Banknote,
  Building2,
  Repeat2,
  Users,
  HandCoins,
  Factory,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
} from "lucide-react";

type Row = {
  id: string;
  trade_date: string | null;
  status: string | null;
  booking_entity_id: string | null;
  booking_entity_name: string | null;
  sales_name: string | null;
  transaction_type: string | null;

  total_size: number | null;
  sell_price: number | null;

  pnl_eur: number | null;

  client_name: string | null;
  introducer_name: string | null;

  retro_client: number | null;
  retro_introducer: number | null;

  product_currency: string | null;
  issuer_name: string | null;
  settlement: "percent" | "units" | null;

};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];


function norm(s: string | null | undefined) {
  return (s ?? "").trim().toLowerCase();
}

function classifyEntity(name: string | null | undefined) {
  const n = norm(name);
  if (!n) return "Other";

  // RiverRock
  if (n.includes("riverrock")) return "RRS";

  // ValSec / Valeur (match real entity strings)
  if (
    n.includes("valeur") ||
    n.includes("valsec") ||
    n.includes("val sec") ||
    n.includes("val-sec") ||
    (n.includes("securities") && n.includes("ag") && n.includes("switzerland"))
  ) {
    return "ValSec";
  }

  return "Other";
}

function monthLabel(i: number) {
  return MONTHS[i] ?? `M${i + 1}`;
}

function formatEUR(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
function formatInt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function formatPctSigned(p: number | null) {
  if (p === null || !Number.isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(0)}%`;
}
function clampLabel(s: string, max = 28) {
  if (!s) return s;
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}
function getCssHslVar(varName: string) {
  return `hsl(var(${varName}))`;
}
function seriesVars() {
  return ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--chart-6"];
}

function ChartTooltip({
  active,
  payload,
  label,
  labelPrefix,
}: {
  active?: boolean;
  payload?: any[];
  label?: any;
  labelPrefix?: string;
}) {
  if (!active || !payload?.length) return null;

  const filtered = payload
    .filter((p) => p && p.value !== undefined && p.value !== null && Number(p.value) !== 0)
    .sort((a, b) => Math.abs(Number(b.value)) - Math.abs(Number(a.value)));

  return (
    <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-950/70 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.12)] px-4 py-3">
      <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {labelPrefix ? `${labelPrefix}: ` : ""}
        {String(label)}
      </div>
      <div className="mt-2 space-y-1">
        {filtered.map((p, i) => (
          <div key={i} className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: p.color || "rgba(0,0,0,0.5)" }} />
              <div className="text-xs text-zinc-600 dark:text-zinc-300 truncate">{clampLabel(String(p.name))}</div>
            </div>
            <div className="text-xs font-medium text-zinc-900 dark:text-zinc-50">{formatEUR(Number(p.value))}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-3xl border border-zinc-200/60 dark:border-zinc-800/60",
        "bg-white/70 dark:bg-zinc-950/45 backdrop-blur-xl",
        "shadow-[0_10px_30px_rgba(0,0,0,0.06)]",
        className,
      ].join(" ")}
    >
      <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-[hsl(var(--primary)/0.10)] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-[hsl(var(--primary)/0.08)] blur-3xl" />
      <div className="relative p-5">{children}</div>
    </div>
  );
}

function SectionTitle({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="text-base md:text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</div>
        {sub ? <div className="text-sm text-zinc-500 mt-1">{sub}</div> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</span>
      <select
        className={[
          "h-10 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60",
          "bg-white/70 dark:bg-zinc-950/40 backdrop-blur-xl",
          "px-3 text-sm text-zinc-900 dark:text-zinc-50",
          "shadow-[0_6px_20px_rgba(0,0,0,0.05)]",
          "focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.25)]",
        ].join(" ")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value?: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className={[
        "rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70",
        "bg-white dark:bg-zinc-950",
        "shadow-[0_10px_24px_rgba(0,0,0,0.06)]",
        "px-5 py-4", // shorter than before
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-zinc-900 dark:text-zinc-50">
            {label}
          </div>

          {value ? (
            <div className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 tabular-nums">
              {value}
            </div>
          ) : null}

          {sub ? (
            <div className="mt-1 text-sm text-zinc-500">
              {sub}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 rounded-2xl bg-[hsl(var(--primary)/0.14)] p-2.5">
          {icon}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  left,
  right,
  value,
  onChange,
}: {
  left: string;
  right: string;
  value: "left" | "right";
  onChange: (v: "left" | "right") => void;
}) {
  return (
    <div className="inline-flex rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/30 p-1">
      <button
        type="button"
        onClick={() => onChange("left")}
        className={[
          "px-3 py-1.5 rounded-xl text-sm font-semibold",
          value === "left" ? "bg-[hsl(var(--primary)/0.15)] text-zinc-900 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-300",
        ].join(" ")}
      >
        {left}
      </button>
      <button
        type="button"
        onClick={() => onChange("right")}
        className={[
          "px-3 py-1.5 rounded-xl text-sm font-semibold",
          value === "right" ? "bg-[hsl(var(--primary)/0.15)] text-zinc-900 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-300",
        ].join(" ")}
      >
        {right}
      </button>
    </div>
  );
}

function WeightBar({ weight01 }: { weight01: number }) {
  const w = Math.max(0, Math.min(1, weight01));
  return (
    <div className="h-2 w-28 rounded-full bg-zinc-200/70 dark:bg-zinc-800/70 overflow-hidden">
      <div className="h-full bg-[hsl(var(--primary))]" style={{ width: `${w * 100}%`, opacity: 0.65 }} />
    </div>
  );
}



function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function AnalyticsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [year, setYear] = useState<string>("");
  const [sales, setSales] = useState<string>("All");
  const [periodMode, setPeriodMode] = useState<"month" | "quarter">("month");
  const [retroCcy, setRetroCcy] = useState<string>("All");
  const chartWrapRef = useRef<HTMLDivElement | null>(null);
  const [chartH, setChartH] = useState<number>(320);


  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("trades_analytics_v")
        .select(
          [
            "id",
            "trade_date",
            "status",
            "booking_entity_name",
            "sales_name",
            "transaction_type",
            "total_size",
            "sell_price",
            "settlement",
            "pnl_eur",
            "client_name",
            "introducer_name",
            "retro_client",
            "retro_introducer",
            "product_currency",
            "settlement",
            "issuer_name",
          ].join(",")
        );

      if (!alive) return;

      if (error) {
        console.error(error);
        setRows([]);
      } else {
        setRows((data ?? []) as unknown as Row[]);
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);
useEffect(() => {
  const el = chartWrapRef.current;
  if (!el) return;

  const measure = () => {
    const rect = el.getBoundingClientRect();
    setChartH(Math.max(260, Math.floor(rect.height)));
  };

  measure(); // measure once immediately

  const ro = new ResizeObserver(() => measure());
  ro.observe(el);

  // also re-measure on window resize
  window.addEventListener("resize", measure);

  return () => {
    ro.disconnect();
    window.removeEventListener("resize", measure);
  };
}, []);
  /* -----------------------------
     FILTERS
  ----------------------------- */

  const years = useMemo(() => {
    const y = new Set<number>();
    rows.forEach((r) => {
      if (!r.trade_date) return;
      const d = new Date(r.trade_date);
      if (!Number.isNaN(d.getTime())) y.add(d.getFullYear());
    });
    const arr = Array.from(y).sort((a, b) => b - a).map(String);
    return arr.length ? arr : [String(new Date().getFullYear())];
  }, [rows]);

  const salesList = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.sales_name && s.add(r.sales_name));
    return ["All", ...Array.from(s).sort()];
  }, [rows]);

  useEffect(() => {
    if (!year && years.length) setYear(years[0]);
  }, [year, years]);

  const filtered = useMemo(() => {
    const y = Number(year);
    return rows.filter((r) => {
      if (!r.trade_date) return false;
      const d = new Date(r.trade_date);
      if (d.getFullYear() !== y) return false;
      if (sales !== "All" && (r.sales_name ?? "") !== sales) return false;
      return true;
    });
  }, [rows, year, sales]);

  // booked + pending only
  const included = useMemo(() => {
    const ok = new Set(["booked", "pending"]);
    return filtered.filter((r) =>
      ok.has((r.status ?? "").toLowerCase())
    );
  }, [filtered]);

  /* -----------------------------
     KPIs
  ----------------------------- */

  const ytdPnl = useMemo(
    () => included.reduce((a, r) => a + (r.pnl_eur ?? 0), 0),
    [included]
  );

  const totalTrades = included.length;

  const pendingTrades = included.filter(
    (r) => (r.status ?? "").toLowerCase() === "pending"
  ).length;

  const avgPnl = ytdPnl / (totalTrades || 1);


  /* -----------------------------
     CLIENTS (GRADIENT HORIZONTAL)
  ----------------------------- */

  const clientsAll = useMemo(() => {
    const m = new Map<string, number>();
    included.forEach((r) => {
      const k = r.client_name ?? "N/A";
      m.set(k, (m.get(k) ?? 0) + (r.pnl_eur ?? 0));
    });
return (() => {
  const arr = Array.from(m.entries())
    .map(([name, pnl]) => ({ name, pnl }))
    .sort((a, b) => b.pnl - a.pnl);

  const total = arr.reduce((a, x) => a + x.pnl, 0) || 1;

  return arr.map((x) => ({
    ...x,
    weight: x.pnl / total, // 0..1
  }));
})();
  }, [included]);


  /* -----------------------------
     VOLUMES BY ISSUER (FIXED)
     volume = total_size × sell_price
  ----------------------------- */

  const volumesByIssuer = useMemo(() => {
    const m = new Map<string, number>();

    included.forEach((r) => {
      const issuer = r.issuer_name ?? "N/A";
      const size = Number(r.total_size ?? 0);
      const price = Number(r.sell_price ?? 0);

      const volume = size * price; // Correct formula

      m.set(issuer, (m.get(issuer) ?? 0) + volume);
    });

    return Array.from(m.entries())
      .map(([issuer, volume]) => ({ issuer, volume }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 15);
  }, [included]);

  // --- Trades by issuer (count + weight, Top 5 + Others) ---
const tradesByIssuer = useMemo(() => {
  const m = new Map<string, number>();

  included.forEach((r) => {
    const issuer = (r.issuer_name ?? "N/A").trim() || "N/A";
    m.set(issuer, (m.get(issuer) ?? 0) + 1);
  });

  const rows = Array.from(m.entries())
    .map(([issuer, trades]) => ({ issuer, trades }))
    .filter((x) => x.trades > 0)
    .sort((a, b) => b.trades - a.trades);

  const total = rows.reduce((a, x) => a + x.trades, 0) || 1;

  return rows.map((x) => ({
    ...x,
    weight: x.trades / total,
  }));
}, [included]);

// =========================
// PART 2 / 2  (paste this after Part 1)
// =========================

  // --- P&L (EUR) table (Month/Quarter) — RRS + ValSec + Other-in-Total, booked+pending only ---
  const pnlPeriodTable = useMemo(() => {
    const byMonth = Array.from({ length: 12 }, (_, i) => ({
      period: monthLabel(i),
      idx: i,
      rrs: 0,
      valsec: 0,
      other: 0,
      total: 0,
      varPct: null as number | null,
    }));

    const byQuarter = Array.from({ length: 4 }, (_, i) => ({
      period: `Q${i + 1}`,
      idx: i,
      rrs: 0,
      valsec: 0,
      other: 0,
      total: 0,
      varPct: null as number | null,
    }));

    for (const r of included) {
      if (!r.trade_date) continue;
      const d = new Date(r.trade_date);
      if (Number.isNaN(d.getTime())) continue;

      const pnl = Number(r.pnl_eur ?? 0);
      const bucket = classifyEntity(r.booking_entity_name);

      const mi = d.getMonth(); // 0..11
      const qi = Math.floor(mi / 3); // 0..3

      if (bucket === "RRS") {
        byMonth[mi].rrs += pnl;
        byQuarter[qi].rrs += pnl;
      } else if (bucket === "ValSec") {
        byMonth[mi].valsec += pnl;
        byQuarter[qi].valsec += pnl;
      } else {
        // IMPORTANT: keep "Other" inside TOTAL so Full Year matches KPI YTD
        byMonth[mi].other += pnl;
        byQuarter[qi].other += pnl;
      }
    }

    const finalize = (arr: typeof byMonth) => {
      const out = arr.map((x) => ({ ...x, total: x.rrs + x.valsec + x.other }));

      // variation vs previous period on TOTAL
      for (let i = 0; i < out.length; i++) {
        if (i === 0) {
          out[i].varPct = null;
          continue;
        }
const prev = out[i - 1].total;
const curr = out[i].total;

// Show variation only if both periods have non-zero totals
if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev === 0 || curr === 0) {
  out[i].varPct = null;
} else {
  out[i].varPct = ((curr - prev) / Math.abs(prev)) * 100;
}
      }

      return out;
    };

    const monthRows = finalize(byMonth);
    const quarterRows = finalize(byQuarter);

    const fullYear = {
      period: "Full Year",
      idx: 999,
      rrs: monthRows.reduce((a, x) => a + x.rrs, 0),
      valsec: monthRows.reduce((a, x) => a + x.valsec, 0),
      other: monthRows.reduce((a, x) => a + x.other, 0),
      total: monthRows.reduce((a, x) => a + x.total, 0),
      varPct: null as number | null,
    };

    return { monthRows, quarterRows, fullYear };
  }, [included]);

  // --- Month-by-month stacked P&L (all booking entities) ---
  const monthlyByEntity = useMemo(() => {
    const entities = Array.from(new Set(included.map((r) => r.booking_entity_name ?? "N/A"))).sort();

    const base = MONTHS.map((m) => {
      const obj: any = { month: m };
      entities.forEach((e) => (obj[e] = 0));
      return obj;
    });

    included.forEach((r) => {
      if (!r.trade_date) return;
      const d = new Date(r.trade_date);
      const mi = d.getMonth();
      const e = r.booking_entity_name ?? "N/A";
      base[mi][e] += r.pnl_eur ?? 0;
    });

    return { data: base, entities };
  }, [included]);

  // --- P&L by booking entity (pie) ---
  const pnlByBookingEntity = useMemo(() => {
    const m = new Map<string, number>();
    included.forEach((r) => {
      const k = r.booking_entity_name ?? "N/A";
      m.set(k, (m.get(k) ?? 0) + (r.pnl_eur ?? 0));
    });
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(m.entries())
      .map(([name, pnl]) => ({ name, pnl, weight: pnl / total }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 12);
  }, [included]);

  // --- P&L by txn type ---
const pnlByTxnType = useMemo(() => {
  const buckets: Record<"primary" | "increase" | "unwind", number> = {
    primary: 0,
    increase: 0,
    unwind: 0,
  };

  const norm2 = (s: string) => s.trim().toLowerCase();

  included.forEach((r) => {
    const t = norm2(r.transaction_type ?? "");

    if (t.includes("primary")) buckets.primary += r.pnl_eur ?? 0;
    else if (t.includes("increase")) buckets.increase += r.pnl_eur ?? 0;
    else if (t.includes("unwind")) buckets.unwind += r.pnl_eur ?? 0;
    // else: ignore (no "other")
  });

  const total = Object.values(buckets).reduce((a, b) => a + b, 0) || 1;

return (Object.entries(buckets) as Array<[keyof typeof buckets, number]>).map(([type, pnl]) => ({
  type: type.charAt(0).toUpperCase() + type.slice(1), // Capitalized label
  pnl,
  weight: pnl / total,
}));
}, [included]);


  // --- Retro by currency (stacked) ---
  const retroByCurrency = useMemo(() => {
    const m = new Map<string, { client: number; introducer: number; total: number }>();
    included.forEach((r) => {
      const ccy = r.product_currency ?? "N/A";
      const cur = m.get(ccy) ?? { client: 0, introducer: 0, total: 0 };
      const rc = Number(r.retro_client ?? 0);
      const ri = Number(r.retro_introducer ?? 0);
      cur.client += rc;
      cur.introducer += ri;
      cur.total += rc + ri;
      m.set(ccy, cur);
    });
    return Array.from(m.entries())
      .map(([ccy, v]) => ({ ccy, ...v }))
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [included]);
  

const retroCurrencies = useMemo(() => {
  const s = new Set<string>();
  included.forEach((r) => {
    const ccy = (r.product_currency ?? "").trim();
    const rc = Number(r.retro_client ?? 0);
    const ri = Number(r.retro_introducer ?? 0);
    if (ccy && (rc !== 0 || ri !== 0)) s.add(ccy);
  });
  return ["All", ...Array.from(s).sort()];
}, [included]);

useEffect(() => {
  if (!retroCurrencies.includes(retroCcy)) {
    setRetroCcy("All");
  }
}, [retroCurrencies, retroCcy]);

const topRetroRecipients = useMemo(() => {
  const m = new Map<string, number>();

  included.forEach((r) => {
    const ccy = (r.product_currency ?? "").trim();
    if (retroCcy !== "All" && ccy !== retroCcy) return;

    const rc = Number(r.retro_client ?? 0);
    const ri = Number(r.retro_introducer ?? 0);

    const clientName = (r.client_name ?? "").trim();
    const introName = (r.introducer_name ?? "").trim();

    if (clientName && rc !== 0) m.set(clientName, (m.get(clientName) ?? 0) + rc);
    if (introName && ri !== 0) m.set(introName, (m.get(introName) ?? 0) + ri);
  });

  const rows = Array.from(m.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  // weights computed within the selected currency scope
  const totalAbs = rows.reduce((a, x) => a + Math.abs(x.amount), 0) || 1;

  return rows.slice(0, 5).map((x) => ({
    ...x,
    weight: Math.abs(x.amount) / totalAbs,
  }));
}, [included, retroCcy]);

  // --- Volumes by issuer, stacked by currency (HORIZONTAL) ---
  const volumesByIssuerCurrency = useMemo(() => {
    const issuers = Array.from(new Set(included.map((r) => (r.issuer_name ?? "N/A").trim() || "N/A"))).sort();
    const currencies = Array.from(new Set(included.map((r) => (r.product_currency ?? "N/A").trim() || "N/A"))).sort();

    const base = issuers.map((iss) => {
      const obj: any = { issuer: clampLabel(iss, 24), _issuerRaw: iss, _total: 0 };
      currencies.forEach((c) => (obj[c] = 0));
      return obj;
    });

    const idx = new Map<string, number>();
    issuers.forEach((iss, i) => idx.set(iss, i));

    included.forEach((r) => {
      const iss = (r.issuer_name ?? "N/A").trim() || "N/A";
      const ccy = (r.product_currency ?? "N/A").trim() || "N/A";
      const i = idx.get(iss);
      if (i === undefined) return;

      // requested formula: Size x Client Price
      const size = Number(r.total_size ?? 0);
      const clientPrice = Number(r.sell_price ?? 0);
let vol = 0;

if (Number.isFinite(size) && Number.isFinite(clientPrice)) {
  const settlement = (r.settlement ?? "").toLowerCase();

  if (settlement === "percent") {
    // Handle both 97.5 and 0.975 style pricing safely
    const scale = clientPrice <= 2 ? 1 : 0.01;
    vol = size * clientPrice * scale;
  } else {
    // units or unknown
    vol = size * clientPrice;
  }
}

      base[i][ccy] += vol;
      base[i]._total += vol;
    });

    // sort by total desc, keep top 12 for chart readability
    const sorted = [...base].sort((a, b) => Math.abs(b._total) - Math.abs(a._total));
    return { data: sorted, currencies };
  }, [included]);

  // --- Gradients ---
  const entityGradients = useMemo(() => {
    return monthlyByEntity.entities.map((e, i) => ({
      key: e,
      id: `grad_entity_${i}`,
      varName: seriesVars()[i % seriesVars().length],
    }));
  }, [monthlyByEntity.entities]);

  const pieVars = ["--primary", "--secondary", "--accent", "--muted-foreground"];

const txnColorMap: Record<string, string> = {
  Primary: "hsl(var(--primary))",
  Increase: "#005F9B",  // your EUR blue
  Unwind: "#405363",    // grey (as requested)
};

const txnColorFallback = "#6d28d9"; // optional fallback (keep or change)

  // client bar gradient
  const clientGradId = "grad_client_bar";
  const retroClientGradId = "grad_retro_client";
  const retroIntroGradId = "grad_retro_intro";

const ccyGradients = useMemo(() => {
  const colorMap: Record<string, string> = {
    CHF: "#1f3a8a",   // deep blue
    EUR: "#005F9B",   // blue
    USD: "#9ca3af",   // grey
  };

  return volumesByIssuerCurrency.currencies.map((ccy) => ({
    ccy,
    id: `grad_ccy_${ccy}`,
    color: colorMap[ccy.toUpperCase()] ?? "#a855f7", // purple fallback
  }));
}, [volumesByIssuerCurrency.currencies]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-950">
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
            <div className="text-sm text-zinc-500 mt-1">
              {loading ? "Loading…" : `Complete overview for ${year}${sales !== "All" ? ` • Sales: ${sales}` : ""}`}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <Select label="Year" value={year} options={years} onChange={setYear} />
            <Select label="Sales" value={sales} options={salesList} onChange={setSales} />
          </div>
        </div>

{/* Top Row – KPIs */}
<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
  <KpiCard
    label="P&L (EUR) — YTD"
    value={loading ? "…" : formatEUR(ytdPnl)}
    icon={<TrendingUp className="h-5 w-5 text-[hsl(var(--primary))]" />}
  />

  <KpiCard
    label="TOTAL # OF TRADES"
    value={loading ? "…" : formatInt(totalTrades)}
    icon={<ListChecks className="h-5 w-5 text-[hsl(var(--primary))]" />}
  />

  <KpiCard
    label="PENDING TRADES"
    value={loading ? "…" : formatInt(pendingTrades)}
    sub="awaiting booking"
    icon={<Hourglass className="h-5 w-5 text-[hsl(var(--primary))]" />}
  />

  <KpiCard
    label="AVG P&L / TRADE"
    value={loading ? "…" : formatEUR(avgPnl)}
    icon={<DivideSquare className="h-5 w-5 text-[hsl(var(--primary))]" />}
  />
</div>


        {/* Row 1 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-stretch">
          {/* P&L Table */}
          <GlassCard className="h-full flex flex-col">
            <SectionTitle
              title="P&L (EUR)"
              sub="RRS vs ValSec • Total + Variation (pending + booked; cancelled excluded)"
              right={
                <Toggle
                  left="Month"
                  right="Quarter"
                  value={periodMode === "month" ? "left" : "right"}
                  onChange={(v) => setPeriodMode(v === "left" ? "month" : "quarter")}
                />
              }
            />

            <div className="mt-4 overflow-auto flex-1">
              <table className="min-w-[680px] w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="py-2 pr-3 font-semibold">Period</th>
                    <th className="py-2 pr-3 font-semibold">P&L (EUR) RRS</th>
                    <th className="py-2 pr-3 font-semibold">P&L (EUR) ValSec</th>
                    <th className="py-2 pr-3 font-semibold text-zinc-700 dark:text-zinc-200">Total P&L (EUR)</th>
                    <th className="py-2 font-semibold">Variation</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...(periodMode === "month" ? pnlPeriodTable.monthRows : pnlPeriodTable.quarterRows),
                    pnlPeriodTable.fullYear,
                  ].map((r) => {
                    const isTotal = r.period === "Full Year";
                    const v = r.varPct;
                    const vPos = v !== null && v > 0;
                    const vNeg = v !== null && v < 0;

                    return (
                      <tr
                        key={r.period}
                        className={[
                          "border-t border-zinc-200/60 dark:border-zinc-800/60",
                          isTotal ? "bg-white/60 dark:bg-zinc-950/25" : "",
                        ].join(" ")}
                      >
                        <td className="py-2 pr-3 font-semibold text-zinc-800 dark:text-zinc-100">{r.period}</td>
                        <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-300">{formatEUR(r.rrs)}</td>
                        <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-300">{formatEUR(r.valsec)}</td>
                        <td className="py-2 pr-3 font-semibold text-zinc-900 dark:text-zinc-50">{formatEUR(r.total)}</td>
                        <td className="py-2">
                          {v === null ? (
                            <span className="text-zinc-400">—</span>
) : (
  <span
    className={[
      "font-semibold inline-flex items-center gap-1.5",
      vPos ? "text-emerald-600" : "",
      vNeg ? "text-red-600" : "",
      !vPos && !vNeg ? "text-zinc-500" : "",
    ].join(" ")}
  >
    {vPos ? (
      <ArrowUpRight className="h-4 w-4" />
    ) : vNeg ? (
      <ArrowDownRight className="h-4 w-4" />
    ) : (
      <ArrowRight className="h-4 w-4" />
    )}

    {formatPctSigned(v)}

    <span className="text-zinc-400 font-normal">
      {periodMode === "month" ? " vs previous month" : " vs previous quarter"}
    </span>
  </span>
)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {/* P&L Month by Month */}
<GlassCard className="h-full flex flex-col">
  <SectionTitle title="P&L (EUR) — Month by Month" sub="Stacked by booking entity" />

<div ref={chartWrapRef} className="mt-4 flex-1 min-h-[320px]">
  <ResponsiveContainer width="100%" height={chartH}>
    <BarChart data={monthlyByEntity.data} barCategoryGap={18}>
        <defs>
          {entityGradients.map((g) => (
            <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`hsl(var(${g.varName}))`} stopOpacity={0.92} />
              <stop offset="100%" stopColor={`hsl(var(${g.varName}))`} stopOpacity={0.22} />
            </linearGradient>
          ))}
        </defs>

        <CartesianGrid strokeDasharray="3 7" stroke="rgba(120,120,120,0.18)" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
        <Tooltip content={<ChartTooltip labelPrefix="" />} />
        <Legend
          iconType="circle"
          wrapperStyle={{ paddingTop: 10 }}
          formatter={(value) => (
            <span className="text-xs text-zinc-600 dark:text-zinc-300">{clampLabel(String(value), 24)}</span>
          )}
        />

        {monthlyByEntity.entities.map((e, idx) => (
          <Bar key={e} dataKey={e} stackId="a" fill={`url(#grad_entity_${idx})`} radius={[14, 14, 10, 10]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  </div>
</GlassCard>
        </div>

        {/* Row 2 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <GlassCard>
            <SectionTitle title="P&L by Booking Entity" sub="Top entities by absolute P&L" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 items-center">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      {pieVars.map((v, i) => (
                        <linearGradient key={v} id={`pie_be_${i}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={`hsl(var(${v}))`} stopOpacity={0.95} />
                          <stop offset="100%" stopColor={`hsl(var(${v}))`} stopOpacity={0.45} />
                        </linearGradient>
                      ))}
                    </defs>
                    <Pie
                      data={pnlByBookingEntity}
                      dataKey="pnl"
                      nameKey="name"
                      outerRadius={92}
                      innerRadius={56}
                      paddingAngle={2}
                      stroke="rgba(255,255,255,0.7)"
                      strokeWidth={2}
                    >
                      {pnlByBookingEntity.map((_, i) => (
                        <Cell key={i} fill={`url(#pie_be_${i % pieVars.length})`} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatEUR(Number(v))} />
                    <Legend
                      iconType="circle"
                      formatter={(value) => <span className="text-xs text-zinc-600">{clampLabel(String(value), 22)}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {pnlByBookingEntity.slice(0, 8).map((x) => (
                  <div
                    key={x.name}
                    className="flex items-center justify-between rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/30 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">{x.name}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{(x.weight * 100).toFixed(1)}%</div>
                    </div>
                    <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{formatEUR(x.pnl)}</div>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <SectionTitle title="P&L by Transaction Type" sub="Primary vs Increase vs Unwind" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 items-center">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
<defs>
  {pnlByTxnType.map((x) => (
    <linearGradient key={x.type} id={`pie_txn_${x.type}`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor={txnColorMap[x.type] ?? "hsl(var(--primary))"} stopOpacity={0.95} />
      <stop offset="100%" stopColor={txnColorMap[x.type] ?? "hsl(var(--primary))"} stopOpacity={0.45} />
    </linearGradient>
  ))}
</defs>

                    <Pie
                      data={pnlByTxnType}
                      dataKey="pnl"
                      nameKey="type"
                      outerRadius={92}
                      innerRadius={56}
                      paddingAngle={2}
                      stroke="rgba(255,255,255,0.7)"
                      strokeWidth={2}
                    >
{pnlByTxnType.map((entry) => (
  <Cell
    key={entry.type}
    fill={`url(#pie_txn_${entry.type})`}
  />
))}
                    </Pie>

                    <Tooltip formatter={(v: any) => formatEUR(Number(v))} />
                    <Legend iconType="circle" formatter={(value) => <span className="text-xs text-zinc-600">{String(value)}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {pnlByTxnType.map((x) => (
                  <div
                    key={x.type}
                    className="flex items-center justify-between rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/30 px-3 py-2"
                  >
                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{x.type}</div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-300">
                      {formatEUR(x.pnl)} <span className="text-zinc-400">•</span> {`${(x.weight * 100).toFixed(1)}%`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Row 3 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Clients horizontal bars (GRADIENT + smaller Y labels) */}
          <GlassCard>
            <SectionTitle title="P&L (EUR) by Client Name" sub="All clients • sorted highest to lowest" />
            <div className="h-[520px] mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={clientsAll.slice(0, 30).map((x) => ({ ...x, name: clampLabel(x.name, 26) }))}
                  layout="vertical"
                  margin={{ left: 24, right: 16, top: 8, bottom: 8 }}
                  barCategoryGap={14}
                >
                  <defs>
                    <linearGradient id={clientGradId} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 7" stroke="rgba(120,120,120,0.18)" />
                  <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={160}
                    tick={{ fontSize: 10 }} // reduced by ~2 notches
                  />
                  <Tooltip content={<ChartTooltip labelPrefix="Client" />} />
                  <Bar dataKey="pnl" fill={`url(#${clientGradId})`} radius={[12, 12, 12, 12]} barSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-xs text-zinc-500">
              Showing top {Math.min(30, clientsAll.length)} clients by P&L for readability.
            </div>
          </GlassCard>

          {/* Clients table */}
          <GlassCard>
            <SectionTitle title="Clients — P&L Table" sub="Client Name • P&L (EUR) • Weight" />
            <div className="mt-4 overflow-auto max-h-[560px]">
              <table className="min-w-[560px] w-full text-sm">
                <thead>
                  <tr className="text-left text-zinc-500">
                    <th className="py-2 pr-3 font-semibold">Client</th>
                    <th className="py-2 pr-3 font-semibold">P&L (EUR)</th>
                    <th className="py-2 font-semibold">Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {clientsAll.map((x) => (
                    <tr key={x.name} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
                      <td className="py-2 pr-3 text-zinc-800 dark:text-zinc-100">{x.name}</td>
                      <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-300">{formatEUR(x.pnl)}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-3">
                          <div className="text-zinc-600 dark:text-zinc-300 text-sm tabular-nums">{(x.weight * 100).toFixed(1)}%</div>
                          <WeightBar weight01={x.weight} />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {clientsAll.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-6 text-zinc-500">
                        —
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-xs text-zinc-500">Sanity check: weights sum to ~100% (rounding may show small drift).</div>
          </GlassCard>
        </div>

        {/* Row 4 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Retro split by currency (GRADIENT + THINNER) */}
          <GlassCard>
            <SectionTitle title="Total Retro Paid — Split by Currency" sub="Client vs Introducer (stacked)" />
            <div className="h-80 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={retroByCurrency} barCategoryGap={18}>
                  <defs>
                    <linearGradient id={retroClientGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.28} />
                    </linearGradient>
                    <linearGradient id={retroIntroGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--secondary))" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="hsl(var(--secondary))" stopOpacity={0.28} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 7" stroke="rgba(120,120,120,0.18)" />
                  <XAxis dataKey="ccy" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
<Tooltip
  content={({ active, payload, label }) => {
    if (!active || !payload?.length) return null;

    const client = Number(
      payload.find((p: any) => p.dataKey === "client")?.value ?? 0
    );
    const introducer = Number(
      payload.find((p: any) => p.dataKey === "introducer")?.value ?? 0
    );
    const total = client + introducer;

    return (
      <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/85 dark:bg-zinc-950/70 backdrop-blur-xl shadow-xl px-4 py-3">
        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {label}
        </div>

        <div className="mt-2 space-y-1 text-xs text-zinc-700 dark:text-zinc-300">
          <div>Client: {formatInt(client)}</div>
          <div>Introducer: {formatInt(introducer)}</div>
        </div>

        <div className="mt-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Total: {formatInt(total)}
        </div>
      </div>
    );
  }}
/>
                  <Legend iconType="circle" />
<Bar
  dataKey="client"
  stackId="r"
  name="Client"
  fill={`url(#${retroClientGradId})`}
  radius={[14, 14, 10, 10]}
  barSize={100}
/>

<Bar
  dataKey="introducer"
  stackId="r"
  name="Introducer"
  fill={`url(#${retroIntroGradId})`}
  radius={[14, 14, 10, 10]}
  barSize={100}
/>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          {/* (unchanged) Top 5 retro recipients table */}
<GlassCard>
  <SectionTitle
    title="Top 5 Retro Recipients"
    sub="Clients + Introducers • filtered by currency"
    right={
      <div className="inline-flex rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/30 p-1">
        {retroCurrencies.map((c) => {
          const active = retroCcy === c;
          return (
            <button
              key={c}
              type="button"
              onClick={() => setRetroCcy(c)}
              className={[
                "px-3 py-1.5 rounded-xl text-sm font-semibold",
                active
                  ? "bg-[hsl(var(--primary)/0.15)] text-zinc-900 dark:text-zinc-50"
                  : "text-zinc-600 dark:text-zinc-300",
              ].join(" ")}
            >
              {c}
            </button>
          );
        })}
      </div>
    }
  />

  <div className="mt-4 overflow-auto">
    <table className="min-w-[520px] w-full text-sm">
      <thead>
        <tr className="text-left text-zinc-500">
          <th className="py-2 pr-3 font-semibold">Recipient</th>
          <th className="py-2 pr-3 font-semibold">{retroCcy === "All" ? "Retro (Total)" : `Retro (${retroCcy})`}</th>
          <th className="py-2 font-semibold">Weight</th>
        </tr>
      </thead>

      <tbody>
        {topRetroRecipients.map((x) => (
          <tr key={x.name} className="border-t border-zinc-200/60 dark:border-zinc-800/60">
            <td className="py-2 pr-3 text-zinc-800 dark:text-zinc-100">{x.name}</td>
            <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-300">{formatInt(x.amount)}</td>
            <td className="py-2">
              <div className="flex items-center gap-3">
                <div className="text-zinc-600 dark:text-zinc-300 text-sm tabular-nums">
                  {(x.weight * 100).toFixed(1)}%
                </div>
                <WeightBar weight01={x.weight} />
              </div>
            </td>
          </tr>
        ))}

        {topRetroRecipients.length === 0 ? (
          <tr>
            <td colSpan={3} className="py-6 text-zinc-500">—</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  </div>

  <div className="mt-2 text-xs text-zinc-500">
    Weights are computed within {retroCcy === "All" ? "all currencies combined" : retroCcy}.
  </div>
</GlassCard>
        </div>

        {/* Row 5 */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Volumes by issuer — HORIZONTAL + GRADIENT + correct formula */}
          <GlassCard>
            <SectionTitle title="Volumes by Issuer" sub="Stacked by currency • Volume = Size × Client Price" />
            <div
  className="mt-4"
  style={{
    height: Math.max(520, volumesByIssuerCurrency.data.length * 34 + 80), // 34px per issuer row
  }}
>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={volumesByIssuerCurrency.data}
                  layout="vertical"
                  margin={{ left: 18, right: 12, top: 8, bottom: 8 }}
                  barCategoryGap={14}
                >
<defs>
  {ccyGradients.map((g) => (
    <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stopColor={g.color} stopOpacity={0.95} />
      <stop offset="100%" stopColor={g.color} stopOpacity={0.35} />
    </linearGradient>
  ))}
</defs>

                  <CartesianGrid strokeDasharray="3 7" stroke="rgba(120,120,120,0.18)" />
                  <XAxis
  type="number"
  tickLine={false}
  axisLine={false}
  tick={{ fontSize: 11 }}
  tickFormatter={(v) => {
    const m = Number(v) / 1_000_000;
    return m >= 1 ? `${m.toFixed(1)}m` : `${(Number(v) / 1000).toFixed(0)}k`;
  }}
/>
                  <YAxis
  type="category"
  dataKey="issuer"
  tickLine={false}
  axisLine={false}
  width={220}
  tick={{ fontSize: 11 }}
  interval={0}
/>
                  <Tooltip
                    formatter={(v: any) => formatInt(Number(v))}
                    contentStyle={{
                      borderRadius: 16,
                      border: "1px solid rgba(120,120,120,0.25)",
                      background: "rgba(255,255,255,0.85)",
                    }}
                  />
                  <Legend iconType="circle" formatter={(value) => <span className="text-xs text-zinc-600">{String(value)}</span>} />

{volumesByIssuerCurrency.currencies.map((ccy) => (
  <Bar
    key={ccy}
    dataKey={ccy}
    stackId="v"
    fill={`url(#grad_ccy_${ccy})`}
    radius={[12, 12, 12, 12]}
    barSize={22}
  />
))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard>
  <SectionTitle
    title="Number Trades by Issuer"
    sub=""
  />

  <div className="mt-4 overflow-auto max-h-[760px]">
    <table className="min-w-[520px] w-full text-sm">
      <thead>
        <tr className="text-left text-zinc-500">
          <th className="py-2 pr-3 font-semibold">Issuer</th>
          <th className="py-2 pr-3 font-semibold">Trades</th>
          <th className="py-2 font-semibold">Weight</th>
        </tr>
      </thead>

      <tbody>
        {tradesByIssuer.map((x) => (
          <tr
            key={x.issuer}
            className="border-t border-zinc-200/60 dark:border-zinc-800/60"
          >
            <td className="py-2 pr-3 text-zinc-800 dark:text-zinc-100">
              {x.issuer}
            </td>

            <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-300">
              {x.trades}
            </td>

            <td className="py-2">
              <div className="flex items-center gap-3">
                <div className="text-zinc-600 dark:text-zinc-300 text-sm tabular-nums">
                  {(x.weight * 100).toFixed(1)}%
                </div>
                <WeightBar weight01={x.weight} />
              </div>
            </td>
          </tr>
        ))}

        {tradesByIssuer.length === 0 && (
          <tr>
            <td colSpan={3} className="py-6 text-zinc-500">
              —
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</GlassCard>

        </div>
      </div>
    </div>
  );
}