"use client";

import React, { useEffect, useMemo, useState } from "react";
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
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatEUR(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}
function formatInt(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
function formatPct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function clampLabel(s: string, max = 28) {
  if (!s) return s;
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function getCssHslVar(varName: string) {
  // Works with shadcn style variables (e.g. --primary is "221 83% 53%")
  return `hsl(var(${varName}))`;
}

/**
 * We keep the app palette by only using CSS variables:
 * --primary, --secondary, --accent, --muted, --foreground
 * This avoids hardcoding purple/blue.
 */
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
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ background: p.color || "rgba(0,0,0,0.5)" }}
              />
              <div className="text-xs text-zinc-600 dark:text-zinc-300 truncate">
                {clampLabel(String(p.name))}
              </div>
            </div>
            <div className="text-xs font-medium text-zinc-900 dark:text-zinc-50">
              {formatEUR(Number(p.value))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
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

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="text-base md:text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </div>
        {sub ? <div className="text-sm text-zinc-500 mt-1">{sub}</div> : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
}) {
  return (
    <GlassCard className="p-0">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
              {value}
            </div>
            {sub ? <div className="mt-1 text-sm text-zinc-500">{sub}</div> : null}
          </div>
          {icon ? (
            <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/40 p-2">
              {icon}
            </div>
          ) : (
            <div className="h-9 w-9 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/40" />
          )}
        </div>
      </div>
    </GlassCard>
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

export default function AnalyticsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const [year, setYear] = useState<string>("");
  const [sales, setSales] = useState<string>("All");

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
            "booking_entity_id",
            "booking_entity_name",
            "sales_name",
            "transaction_type",
            "total_size",
            "sell_price",
            "pnl_eur",
            "client_name",
            "introducer_name",
            "retro_client",
            "retro_introducer",
            "product_currency",
            "issuer_name",
          ].join(",")
        );

      if (!alive) return;

      if (error) {
        console.error("Analytics Supabase error:", JSON.stringify(error, null, 2));
        setRows([]);
      } else {
        setRows((data ?? []) as Row[]);
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

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
    rows.forEach((r) => {
      if (r.sales_name) s.add(r.sales_name);
    });
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

  // Pending + booked only
  const included = useMemo(() => {
    const ok = new Set(["booked", "pending"]);
    return filtered.filter((r) => ok.has((r.status ?? "").toLowerCase()));
  }, [filtered]);

  const ytdPnl = useMemo(() => included.reduce((a, r) => a + (r.pnl_eur ?? 0), 0), [included]);
  const grossVolume = useMemo(
    () => included.reduce((a, r) => a + (r.total_size ?? 0) * (r.sell_price ?? 0), 0),
    [included]
  );
  const retroClientTotal = useMemo(
    () => included.reduce((a, r) => a + (r.retro_client ?? 0), 0),
    [included]
  );
  const retroIntroTotal = useMemo(
    () => included.reduce((a, r) => a + (r.retro_introducer ?? 0), 0),
    [included]
  );
  const avgPnl = useMemo(() => ytdPnl / (included.length || 1), [ytdPnl, included.length]);

  const monthlyByEntity = useMemo(() => {
    const entities = Array.from(
      new Set(included.map((r) => r.booking_entity_name ?? "N/A"))
    ).sort();

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

  const quarterlyByEntity = useMemo(() => {
    const entities = Array.from(
      new Set(included.map((r) => r.booking_entity_name ?? "N/A"))
    ).sort();

    const quarters = ["Q1", "Q2", "Q3", "Q4"].map((q) => {
      const obj: any = { quarter: q };
      entities.forEach((e) => (obj[e] = 0));
      return obj;
    });

    included.forEach((r) => {
      if (!r.trade_date) return;
      const d = new Date(r.trade_date);
      const qi = Math.floor(d.getMonth() / 3);
      const e = r.booking_entity_name ?? "N/A";
      quarters[qi][e] += r.pnl_eur ?? 0;
    });

    return { data: quarters, entities };
  }, [included]);

  const pnlByTxnType = useMemo(() => {
    const buckets: Record<string, number> = { primary: 0, increase: 0, unwind: 0, other: 0 };
    const norm = (s: string) => s.trim().toLowerCase();

    included.forEach((r) => {
      const t = norm(r.transaction_type ?? "other");
      const k = t.includes("primary")
        ? "primary"
        : t.includes("increase")
        ? "increase"
        : t.includes("unwind")
        ? "unwind"
        : "other";
      buckets[k] += r.pnl_eur ?? 0;
    });

    const total = Object.values(buckets).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(buckets).map(([type, pnl]) => ({ type, pnl, weight: pnl / total }));
  }, [included]);

  const pnlByIssuerCurrency = useMemo(() => {
    const m = new Map<string, number>(); // issuer|||ccy
    included.forEach((r) => {
      const issuer = r.issuer_name ?? "N/A";
      const ccy = r.product_currency ?? "N/A";
      const key = `${issuer}|||${ccy}`;
      m.set(key, (m.get(key) ?? 0) + (r.pnl_eur ?? 0));
    });

    return Array.from(m.entries())
      .map(([k, pnl]) => {
        const [issuer, ccy] = k.split("|||");
        return { issuer, ccy, pnl };
      })
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 12);
  }, [included]);

  const topClients = useMemo(() => {
    const m = new Map<string, number>();
    included.forEach((r) => {
      const k = r.client_name ?? "N/A";
      m.set(k, (m.get(k) ?? 0) + (r.pnl_eur ?? 0));
    });
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(m.entries())
      .map(([name, pnl]) => ({ name, pnl, weight: pnl / total }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 12);
  }, [included]);

  const topIntroducers = useMemo(() => {
    const m = new Map<string, number>();
    included.forEach((r) => {
      const k = r.introducer_name ?? "N/A";
      m.set(k, (m.get(k) ?? 0) + (r.pnl_eur ?? 0));
    });
    const total = Array.from(m.values()).reduce((a, b) => a + b, 0) || 1;
    return Array.from(m.entries())
      .map(([name, pnl]) => ({ name, pnl, weight: pnl / total }))
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 12);
  }, [included]);

  // Modern, palette-safe series mapping using CSS variables only.
  const seriesColor = useMemo(() => {
    const vars = seriesVars();
    const map = new Map<string, string>();
    monthlyByEntity.entities.forEach((e, i) => {
      map.set(e, getCssHslVar(vars[i % vars.length]));
    });
    return map;
  }, [monthlyByEntity.entities]);

  // Gradients for each entity (keeps palette; improves separation).
  const entityGradients = useMemo(() => {
    return monthlyByEntity.entities.map((e, i) => {
      const v = seriesVars()[i % seriesVars().length];
      return { key: e, id: `grad_entity_${i}`, varName: v };
    });
  }, [monthlyByEntity.entities]);

  const pieVars = ["--primary", "--secondary", "--accent", "--muted-foreground"];

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-950">
      <div className="p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Analytics</h1>
            <div className="text-sm text-zinc-500 mt-1">
              {loading
                ? "Loading…"
                : `Pending + booked analytics for ${year}${sales !== "All" ? ` • Sales: ${sales}` : ""}`}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <Select label="Year" value={year} options={years} onChange={setYear} />
            <Select label="Sales" value={sales} options={salesList} onChange={setSales} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Stat label="P&L (EUR) — YTD" value={loading ? "…" : formatEUR(ytdPnl)} />
          <Stat label="Pending + Booked Trades" value={loading ? "…" : formatInt(included.length)} />
          <Stat label="Avg P&L / Trade" value={loading ? "…" : formatEUR(avgPnl)} />
          <Stat label="Gross Volume (Σ size×sell)" value={loading ? "…" : formatInt(grossVolume)} />
          <Stat
            label="Retro Totals"
            value={loading ? "…" : `${formatInt(retroClientTotal)} / ${formatInt(retroIntroTotal)}`}
            sub="Client / Introducer"
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <GlassCard>
            <SectionTitle title="P&L (EUR) — Month by Month" sub="Stacked by booking entity" />
            <div className="h-80 mt-4">
              <ResponsiveContainer width="100%" height="100%">
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
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                  />
                  <Tooltip content={<ChartTooltip labelPrefix="" />} />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ paddingTop: 10 }}
                    formatter={(value) => (
                      <span className="text-xs text-zinc-600 dark:text-zinc-300">
                        {clampLabel(String(value), 24)}
                      </span>
                    )}
                  />
                  {monthlyByEntity.entities.map((e, idx) => (
                    <Bar
                      key={e}
                      dataKey={e}
                      stackId="a"
                      fill={`url(#grad_entity_${idx})`}
                      radius={[14, 14, 10, 10]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>

          <GlassCard>
            <SectionTitle title="P&L (EUR) — Quarter by Quarter" sub="Stacked by booking entity" />
            <div className="h-80 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={quarterlyByEntity.data} barCategoryGap={28}>
                  <defs>
                    {entityGradients.map((g) => (
                      <linearGradient key={`q_${g.id}`} id={`q_${g.id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={`hsl(var(${g.varName}))`} stopOpacity={0.92} />
                        <stop offset="100%" stopColor={`hsl(var(${g.varName}))`} stopOpacity={0.22} />
                      </linearGradient>
                    ))}
                  </defs>

                  <CartesianGrid strokeDasharray="3 7" stroke="rgba(120,120,120,0.18)" />
                  <XAxis dataKey="quarter" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                  />
                  <Tooltip content={<ChartTooltip labelPrefix="" />} />
                  <Legend
                    iconType="circle"
                    wrapperStyle={{ paddingTop: 10 }}
                    formatter={(value) => (
                      <span className="text-xs text-zinc-600 dark:text-zinc-300">
                        {clampLabel(String(value), 24)}
                      </span>
                    )}
                  />
                  {quarterlyByEntity.entities.map((e, idx) => (
                    <Bar
                      key={e}
                      dataKey={e}
                      stackId="q"
                      fill={`url(#q_grad_entity_${idx})`}
                      radius={[14, 14, 10, 10]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </GlassCard>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <GlassCard>
            <SectionTitle title="Transaction Type — P&L Split" sub="Primary vs Increase vs Unwind" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 items-center">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      {pieVars.map((v, i) => (
                        <linearGradient key={v} id={`pie_${i}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={`hsl(var(${v}))`} stopOpacity={0.95} />
                          <stop offset="100%" stopColor={`hsl(var(${v}))`} stopOpacity={0.45} />
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
                      {pnlByTxnType.map((_, i) => (
                        <Cell key={i} fill={`url(#pie_${i % pieVars.length})`} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: any) => formatEUR(Number(v))}
                      contentStyle={{
                        borderRadius: 16,
                        border: "1px solid rgba(120,120,120,0.25)",
                        background: "rgba(255,255,255,0.85)",
                      }}
                    />
                    <Legend
                      iconType="circle"
                      formatter={(value) => (
                        <span className="text-xs text-zinc-600">{String(value)}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                {pnlByTxnType.map((x) => (
                  <div
                    key={x.type}
                    className="flex items-center justify-between rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/30 px-3 py-2"
                  >
                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      {x.type}
                    </div>
                    <div className="text-sm text-zinc-600 dark:text-zinc-300">
                      {formatEUR(x.pnl)} <span className="text-zinc-400">•</span> {formatPct(x.weight)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <SectionTitle title="Issuer × Currency — P&L" sub="Top 12 combinations by absolute P&L" />
            <div className="mt-4 space-y-2">
              {pnlByIssuerCurrency.map((x) => (
                <div
                  key={`${x.issuer}-${x.ccy}`}
                  className="flex items-center justify-between rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">
                      {x.issuer}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{x.ccy}</div>
                  </div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {formatEUR(x.pnl)}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <GlassCard>
            <SectionTitle title="Clients — P&L Split" sub="Top 12 by absolute P&L" />
            <div className="mt-4 space-y-2">
              {topClients.map((x) => (
                <div
                  key={x.name}
                  className="flex items-center justify-between rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">
                      {x.name}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{formatPct(x.weight)}</div>
                  </div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {formatEUR(x.pnl)}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <SectionTitle title="Introducers — P&L Split" sub="Top 12 by absolute P&L" />
            <div className="mt-4 space-y-2">
              {topIntroducers.map((x) => (
                <div
                  key={x.name}
                  className="flex items-center justify-between rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/30 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">
                      {x.name}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{formatPct(x.weight)}</div>
                  </div>
                  <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                    {formatEUR(x.pnl)}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}