/**
 * emailReport.ts
 * Generates and downloads a .eml P&L report from dashboard data.
 * Charts are rendered as inline SVG then embedded as base64 <img> tags
 * for broad email-client compatibility (Outlook, Apple Mail, etc.)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PnlRow {
  period: string;
  rrs: number;
  valsec: number;
  other: number;
  total: number;
}

export interface PendingTradeEmailRow {
  isin: string;
  product: string;
  ccy: string;
  size: number | null;
  buyLegs: string[];  // counterparty names on dealer-buy legs
  sellLegs: string[]; // counterparty names on dealer-sell legs
  client: string;
  valueDate: string | null; // ISO date string, used for grouping
}

export interface EmailReportData {
  year: string;
  sales: string;
  salesEmail?: string;
  pnlRows: PnlRow[];
  pnlFullYear: PnlRow;
  pnlByBookingEntity: { name: string; pnl: number; weight: number }[];
  pnlByTxnType: { type: string; pnl: number; weight: number }[];
  clientsAll: { name: string; pnl: number; weight: number }[];
  volumesByIssuerCurrency: {
    data: ({ issuer: string; _total: number } & Record<string, number | string>)[];
    currencies: string[];
  };
  tradesByIssuer: { issuer: string; trades: number; weight: number }[];
  pendingTrades: PendingTradeEmailRow[];
}

// ─── Colours ─────────────────────────────────────────────────────────────────

const ENTITY_COLORS = [
  "#002651",
  "#1B3A6B",
  "#2E5FA3",
  "#5B8ED4",
  "#A8BFD6",
  "#C5D8F0",
];

const TXN_COLORS: Record<string, string> = {
  Primary: "#002651",
  Increase: "#005F9B",
  Unwind: "#405363",
};

const CCY_COLORS: Record<string, string> = {
  CHF: "#1f3a8a",
  EUR: "#005F9B",
  USD: "#9ca3af",
};

function ccyColor(ccy: string): string {
  return CCY_COLORS[ccy.toUpperCase()] ?? "#a855f7";
}

// ─── Formatters ───────────────────────────────────────────────────────────────

/** Abbreviated formatter for legends: €28.5K, €1.23M */
function fmtEUR(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}€${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}€${(abs / 1_000).toFixed(1)}K`;
  return `${sign}€${abs.toFixed(0)}`;
}

/** Full formatter for tables: €28,456 */
function fmtEURFull(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const str = Math.round(abs)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}€${str}`;
}

function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

// ─── HTML escaping ────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── SVG → PNG via Canvas (email-safe) ───────────────────────────────────────
// data:image/svg+xml is blocked or unsupported by Outlook and many clients.
// Rendering to a Canvas and exporting as PNG gives near-universal compatibility.

async function svgToPngDataUrl(
  svgStr: string,
  width: number,
  height: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const scale = 2; // 2× for crisp rendering
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) { reject(new Error("canvas unavailable")); return; }

    // White background so transparent SVG areas don't turn black
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      // Fall back to a 1×1 transparent PNG on failure
      resolve("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
    };
    img.src = url;
  });
}

function imgTag(src: string, width: number, height: number): string {
  return (
    `<img src="${src}" width="${width}" height="${height}" ` +
    `style="display:block;max-width:100%;" alt="" />`
  );
}

// ─── SVG Donut chart ─────────────────────────────────────────────────────────

function buildDonutSvg(
  segments: { label: string; value: number; color: string }[],
  size = 200
): string {
  const cx = size / 2;
  const cy = size / 2;
  const OR = size * 0.42;
  const IR = size * 0.26;

  const pos = segments.filter((s) => s.value > 0);
  const total = pos.reduce((s, x) => s + x.value, 0);

  if (!pos.length || total <= 0) {
    return (
      `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
      `<circle cx="${cx}" cy="${cy}" r="${OR}" fill="#e5e7eb"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${IR}" fill="white"/>` +
      `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" fill="#9ca3af" font-family="Arial,sans-serif">No data</text>` +
      `</svg>`
    );
  }

  const r = (v: number) => v.toFixed(3);
  let paths = "";
  let angle = -Math.PI / 2;

  for (const seg of pos) {
    let sweep = (seg.value / total) * 2 * Math.PI;
    if (sweep >= 2 * Math.PI - 0.001) sweep = 2 * Math.PI - 0.002;
    const end = angle + sweep;
    const large = sweep > Math.PI ? 1 : 0;

    const ox1 = cx + OR * Math.cos(angle), oy1 = cy + OR * Math.sin(angle);
    const ox2 = cx + OR * Math.cos(end),   oy2 = cy + OR * Math.sin(end);
    const ix1 = cx + IR * Math.cos(end),   iy1 = cy + IR * Math.sin(end);
    const ix2 = cx + IR * Math.cos(angle), iy2 = cy + IR * Math.sin(angle);

    paths +=
      `<path d="M ${r(ox1)} ${r(oy1)} A ${OR} ${OR} 0 ${large} 1 ${r(ox2)} ${r(oy2)} ` +
      `L ${r(ix1)} ${r(iy1)} A ${IR} ${IR} 0 ${large} 0 ${r(ix2)} ${r(iy2)} Z" ` +
      `fill="${seg.color}" stroke="white" stroke-width="2"/>`;

    angle = end;
  }

  return (
    `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
    paths +
    `</svg>`
  );
}

// ─── SVG Stacked Horizontal Bar chart ────────────────────────────────────────

function buildStackedBarsSvg(
  data: ({ issuer: string; _total: number } & Record<string, number | string>)[],
  currencies: string[],
  svgW = 560
): string {
  const ROW_H = 20;
  const GAP = 8;
  const LABEL_W = 170;
  const BAR_W = svgW - LABEL_W - 12;

  const maxTotal = Math.max(...data.map((d) => Math.abs(Number(d._total))), 1);
  const svgH = data.length * (ROW_H + GAP) + 6;

  let content = "";

  data.forEach((d, i) => {
    const y = i * (ROW_H + GAP);
    content +=
      `<text x="${LABEL_W - 6}" y="${(y + ROW_H * 0.73).toFixed(1)}" ` +
      `text-anchor="end" font-size="10.5" fill="#374151" font-family="Arial,sans-serif">` +
      `${esc(String(d.issuer))}</text>`;

    let bx = LABEL_W;
    for (const ccy of currencies) {
      const val = Number(d[ccy]) || 0;
      if (val <= 0) continue;
      const bw = Math.max(2, (val / maxTotal) * BAR_W);
      content +=
        `<rect x="${bx.toFixed(1)}" y="${y}" width="${bw.toFixed(1)}" height="${ROW_H}" ` +
        `fill="${ccyColor(ccy)}" opacity="0.82" rx="3"/>`;
      bx += bw;
    }
  });

  return (
    `<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">` +
    content +
    `</svg>`
  );
}

// ─── Legend strip ─────────────────────────────────────────────────────────────

function legendStrip(
  items: { label: string; color: string; value?: string }[]
): string {
  // Use a colored ● character instead of a background-colored empty span —
  // background: on empty elements is stripped by Outlook and many clients,
  // but the `color:` property on a text node survives reliably.
  return items
    .map(
      (x) =>
        `<span style="display:inline-block;margin:0 14px 6px 0;white-space:nowrap;vertical-align:middle;">` +
        `<span style="color:${x.color};font-size:13px;line-height:1;vertical-align:middle;">&#9679;</span>` +
        `<span style="font-size:11px;color:#6b7280;margin-left:4px;vertical-align:middle;">${esc(x.label)}${x.value ? ": " + x.value : ""}</span>` +
        `</span>`
    )
    .join("");
}

// ─── HTML builder ────────────────────────────────────────────────────────────

interface ChartImages {
  entityDonutSrc: string;
  txnDonutSrc: string;
  volBarSrc: string;
  volBarHeight: number;
}

function buildHtml(data: EmailReportData, charts: ChartImages): string {
  const dateStr = todayStr();
  const salesLabel = data.sales === "All" ? "All Sales" : data.sales;

  /* ── shared style snippets ── */
  const SEC = "padding:28px 36px;border-bottom:1px solid #f0f0f0;";
  const SEC_LAST = "padding:28px 36px;";
  const TITLE =
    "font-size:10.5px;font-weight:700;color:#6b7280;letter-spacing:0.07em;" +
    "text-transform:uppercase;margin:0 0 16px 0;";
  const TH_L =
    "padding:8px 12px;text-align:left;font-size:10px;color:#9ca3af;" +
    "font-weight:700;text-transform:uppercase;border-bottom:2px solid #e5e7eb;";
  const TH_R = TH_L.replace("left", "right");
  const TD_L =
    "padding:7px 12px;font-size:12px;color:#374151;border-bottom:1px solid #f3f4f6;";
  const TD_R = TD_L + "text-align:right;font-variant-numeric:tabular-nums;";
  const TD_TOTAL =
    "padding:7px 12px;font-size:12px;font-weight:700;color:#002651;" +
    "text-align:right;font-variant-numeric:tabular-nums;" +
    "border-bottom:1px solid #f3f4f6;background:#f8fafc;";
  const TD_FY_LABEL =
    "padding:9px 12px;font-size:12px;font-weight:700;color:#002651;" +
    "border-top:2px solid #002651;background:#EBF0F8;";
  const TD_FY_R =
    "padding:9px 12px;font-size:12px;font-weight:700;color:#002651;" +
    "text-align:right;font-variant-numeric:tabular-nums;" +
    "border-top:2px solid #002651;background:#EBF0F8;";

  /* ─── 1. P&L Monthly table (full number format) ─── */
  const monthRows = data.pnlRows
    .map((r) => {
      const zero = r.total === 0 && r.rrs === 0 && r.valsec === 0;
      return (
        `<tr>` +
        `<td style="${TD_L}">${esc(r.period)}</td>` +
        `<td style="${TD_R}">${zero ? "—" : fmtEURFull(r.rrs)}</td>` +
        `<td style="${TD_R}">${zero ? "—" : fmtEURFull(r.valsec)}</td>` +
        `<td style="${TD_TOTAL}">${zero ? "—" : fmtEURFull(r.total)}</td>` +
        `</tr>`
      );
    })
    .join("");

  const fy = data.pnlFullYear;
  const fyRow =
    `<tr>` +
    `<td style="${TD_FY_LABEL}">${esc(fy.period)}</td>` +
    `<td style="${TD_FY_R}">${fmtEURFull(fy.rrs)}</td>` +
    `<td style="${TD_FY_R}">${fmtEURFull(fy.valsec)}</td>` +
    `<td style="${TD_FY_R}">${fmtEURFull(fy.total)}</td>` +
    `</tr>`;

  const pnlTable =
    `<table style="width:100%;border-collapse:collapse;">` +
    `<thead><tr>` +
    `<th style="${TH_L}">Period</th>` +
    `<th style="${TH_R}">P&amp;L RRS</th>` +
    `<th style="${TH_R}">P&amp;L ValSec</th>` +
    `<th style="${TH_R}">Total P&amp;L</th>` +
    `</tr></thead>` +
    `<tbody>${monthRows}${fyRow}</tbody>` +
    `</table>`;

  /* ─── 2. Pending trades — grouped by issue date ─── */
  const PT_BASE = "padding:10px 12px;font-size:11px;border-bottom:1px solid #f3f4f6;vertical-align:top;";
  const PT_CLIENT = PT_BASE + "font-weight:600;color:#002651;";
  const PT_ISIN   = PT_BASE + "color:#002651;";
  const PT_CCY    = PT_BASE + "color:#374151;text-align:right;white-space:nowrap;";
  const PT_SIZE   = PT_BASE + "color:#374151;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums;";
  const PT_LEGS   = PT_BASE + "color:#374151;";

  const renderBadge = (label: string, color: string, name: string) =>
    `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:4px;"><tr>` +
    `<td style="background:${color};color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:3px;white-space:nowrap;line-height:14px;vertical-align:middle;">${label}</td>` +
    `<td style="padding-left:5px;font-size:11px;color:#374151;vertical-align:middle;">${esc(name)}</td>` +
    `</tr></table>`;

  const fmtSize = (n: number | null) =>
    n == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    const [y, m, d] = iso.slice(0, 10).split("-");
    return `${d}.${m}.${y}`;
  };

  const buildPendingTable = (trades: PendingTradeEmailRow[]) => {
    const rows = trades.map((r, i) => {
      const bg = i % 2 === 1 ? "background:#fafafa;" : "";
      const buyHtml  = r.buyLegs.length  ? r.buyLegs.map((n)  => renderBadge("B", "#2E5FA3", n)).join("") : renderBadge("B", "#9ca3af", "—");
      const sellHtml = r.sellLegs.length ? r.sellLegs.map((n) => renderBadge("S", "#405363", n)).join("") : renderBadge("S", "#9ca3af", "—");
      return (
        `<tr>` +
        `<td width="130" style="${PT_CLIENT}${bg}">${esc(r.client) || "—"}</td>` +
        `<td width="180" style="${PT_ISIN}${bg}">${esc(r.isin)}<br/><span style="font-size:10px;font-weight:400;color:#6b7280;">${esc(r.product)}</span></td>` +
        `<td width="40"  style="${PT_CCY}${bg}">${esc(r.ccy)}</td>` +
        `<td width="80"  style="${PT_SIZE}${bg}">${fmtSize(r.size)}</td>` +
        `<td width="170" style="${PT_LEGS}${bg}">${buyHtml}${sellHtml}</td>` +
        `</tr>`
      );
    }).join("");
    return (
      `<table width="600" style="width:100%;border-collapse:collapse;">` +
      `<thead><tr>` +
      `<th width="130" style="${TH_L}">Client</th>` +
      `<th width="180" style="${TH_L}">ISIN / Product</th>` +
      `<th width="40"  style="${TH_R}">CCY</th>` +
      `<th width="80"  style="${TH_R}">Size</th>` +
      `<th width="170" style="${TH_L}">Legs</th>` +
      `</tr></thead>` +
      `<tbody>${rows}</tbody>` +
      `</table>`
    );
  };

  // Group pending trades by value_date, sorted ascending
  const pendingByDate = (() => {
    const map = new Map<string, PendingTradeEmailRow[]>();
    for (const t of data.pendingTrades) {
      const key = t.valueDate ?? "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  })();

  const DATE_SUBTITLE =
    "font-size:11px;font-weight:700;color:#002651;letter-spacing:0.06em;" +
    "text-transform:uppercase;margin:16px 0 8px 0;";

  const pendingSection = data.pendingTrades.length === 0
    ? `<p style="font-size:12px;color:#9ca3af;margin:0;">No pending trades.</p>`
    : pendingByDate.map(([dateKey, trades]) =>
        `<p style="${DATE_SUBTITLE}">Issue Date &nbsp;${fmtDate(dateKey === "—" ? null : dateKey)}</p>` +
        buildPendingTable(trades)
      ).join("<div style='height:16px;'></div>");

  /* ─── 3. Donut charts — PNG srcs pre-computed asynchronously ─── */
  const entityDonutImg = imgTag(charts.entityDonutSrc, 200, 200);
  const entityLegend = legendStrip(
    data.pnlByBookingEntity.map((x, i) => ({
      label: x.name,
      color: ENTITY_COLORS[i % ENTITY_COLORS.length],
      value: fmtEUR(x.pnl),
    }))
  );

  const txnDonutImg = imgTag(charts.txnDonutSrc, 200, 200);
  const txnLegend = legendStrip(
    data.pnlByTxnType.map((x) => ({
      label: x.type,
      color: TXN_COLORS[x.type] ?? "#405363",
      value: fmtEUR(x.pnl),
    }))
  );

  /* ─── 4. Clients P&L table (full number format) ─── */
  const clientRows = data.clientsAll
    .map((x) => {
      const barW = Math.max(2, Math.round(Math.max(0, x.weight) * 80));
      return (
        `<tr>` +
        `<td style="${TD_L}">${esc(x.name)}</td>` +
        `<td style="${TD_R}">${fmtEURFull(x.pnl)}</td>` +
        `<td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;">` +
        `<span style="font-size:11px;color:#6b7280;margin-right:8px;">${(x.weight * 100).toFixed(1)}%</span>` +
        `<span style="display:inline-block;height:6px;width:${barW}px;background:#002651;opacity:0.4;border-radius:3px;vertical-align:middle;"></span>` +
        `</td>` +
        `</tr>`
      );
    })
    .join("");

  const clientsTable =
    `<table style="width:100%;border-collapse:collapse;">` +
    `<thead><tr>` +
    `<th style="${TH_L}">Client</th>` +
    `<th style="${TH_R}">P&amp;L (EUR)</th>` +
    `<th style="${TH_L}">Weight</th>` +
    `</tr></thead>` +
    `<tbody>${clientRows}</tbody>` +
    `</table>`;

  /* ─── 5. Volumes by issuer — PNG src pre-computed asynchronously ─── */
  const { currencies } = data.volumesByIssuerCurrency;
  const volBarImg = imgTag(charts.volBarSrc, 560, charts.volBarHeight);
  const volLegend = legendStrip(
    currencies.map((ccy) => ({ label: ccy, color: ccyColor(ccy) }))
  );

  /* ─── 6. Number Trades by Issuer table ─── */
  const tradesRows = data.tradesByIssuer
    .map((x) => {
      const barW = Math.max(2, Math.round(Math.max(0, x.weight) * 80));
      return (
        `<tr>` +
        `<td style="${TD_L}">${esc(x.issuer)}</td>` +
        `<td style="${TD_R}">${x.trades}</td>` +
        `<td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;">` +
        `<span style="font-size:11px;color:#6b7280;margin-right:8px;">${(x.weight * 100).toFixed(1)}%</span>` +
        `<span style="display:inline-block;height:6px;width:${barW}px;background:#002651;opacity:0.4;border-radius:3px;vertical-align:middle;"></span>` +
        `</td>` +
        `</tr>`
      );
    })
    .join("");

  const tradesTable =
    `<table style="width:100%;border-collapse:collapse;">` +
    `<thead><tr>` +
    `<th style="${TH_L}">Issuer</th>` +
    `<th style="${TH_R}">Trades</th>` +
    `<th style="${TH_L}">Weight</th>` +
    `</tr></thead>` +
    `<tbody>${tradesRows}</tbody>` +
    `</table>`;

  /* ─── Assemble ─── */
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>P&amp;L Report</title>
</head>
<body style="margin:0;padding:24px 12px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="660" align="center" cellpadding="0" cellspacing="0" style="max-width:660px;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1);">
  <tr><td>

    <!-- Header -->
    <div style="background:#002651;padding:28px 36px;">
      <div style="font-size:20px;font-weight:700;color:white;letter-spacing:0.01em;">P&amp;L Report</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:6px;">
        As of ${dateStr} &nbsp;&middot;&nbsp; ${esc(data.year)} &nbsp;&middot;&nbsp; ${esc(salesLabel)}
      </div>
    </div>

    <!-- 1. P&L Monthly -->
    <div style="${SEC}">
      <p style="${TITLE}">P&amp;L (EUR) &mdash; Monthly View</p>
      ${pnlTable}
    </div>

    <!-- 2. Pending Trades -->
    <div style="${SEC}">
      <p style="${TITLE}">Pending Trades</p>
      ${pendingSection}
    </div>

    <!-- 3. Donut charts (side by side via table for email compat) -->
    <div style="${SEC}">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="width:50%;padding-right:24px;vertical-align:top;">
            <p style="${TITLE}">P&amp;L by Booking Entity</p>
            <div style="text-align:center;">${entityDonutImg}</div>
            <div style="margin-top:10px;">${entityLegend}</div>
          </td>
          <td style="width:50%;vertical-align:top;">
            <p style="${TITLE}">P&amp;L by Transaction Type</p>
            <div style="text-align:center;">${txnDonutImg}</div>
            <div style="margin-top:10px;">${txnLegend}</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- 4. Clients P&L -->
    <div style="${SEC}">
      <p style="${TITLE}">Clients &mdash; P&amp;L</p>
      ${clientsTable}
    </div>

    <!-- 5. Volumes by Issuer -->
    <div style="${SEC}">
      <p style="${TITLE}">Volumes by Issuer</p>
      ${volBarImg}
      <div style="margin-top:10px;">${volLegend}</div>
    </div>

    <!-- 6. Number of Trades by Issuer -->
    <div style="${SEC_LAST}">
      <p style="${TITLE}">Number of Trades by Issuer</p>
      ${tradesTable}
    </div>

    <!-- Footer -->
    <div style="background:#f9fafb;padding:14px 36px;font-size:11px;color:#9ca3af;text-align:center;border-top:1px solid #f0f0f0;">
      Generated ${dateStr} &nbsp;&middot;&nbsp; Valeur Paris
    </div>

  </td></tr>
  </table>
</body>
</html>`;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function downloadEmailReport(data: EmailReportData): Promise<void> {
  const dateStr = todayStr();
  const salesLabel = data.sales === "All" ? "All Sales" : data.sales;
  const subject = `P&L Report as of ${dateStr} ${salesLabel}`;
  const fromEmail = data.salesEmail ?? "trading@valeur.ch";

  // Pre-render all SVG charts to PNG in parallel for email-client compatibility
  const entitySegments = data.pnlByBookingEntity.map((x, i) => ({
    label: x.name,
    value: x.pnl,
    color: ENTITY_COLORS[i % ENTITY_COLORS.length],
  }));
  const txnSegments = data.pnlByTxnType.map((x) => ({
    label: x.type,
    value: x.pnl,
    color: TXN_COLORS[x.type] ?? "#405363",
  }));
  const { data: volData, currencies } = data.volumesByIssuerCurrency;
  const volBarSvg = buildStackedBarsSvg(volData, currencies, 560);
  const volBarHeight = Math.max(60, volData.length * 28 + 6);

  const [entityDonutSrc, txnDonutSrc, volBarSrc] = await Promise.all([
    svgToPngDataUrl(buildDonutSvg(entitySegments, 200), 200, 200),
    svgToPngDataUrl(buildDonutSvg(txnSegments, 200), 200, 200),
    svgToPngDataUrl(volBarSvg, 560, volBarHeight),
  ]);

  const html = buildHtml(data, { entityDonutSrc, txnDonutSrc, volBarSrc, volBarHeight });

  const eml = [
    "MIME-Version: 1.0",
    `Date: ${new Date().toUTCString()}`,
    `Subject: ${subject}`,
    `From: ${fromEmail}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
  ].join("\r\n");

  const blob = new Blob([eml], { type: "message/rfc822" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `PnL_Report_${dateStr}_${salesLabel.replace(/\s+/g, "_")}.eml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
