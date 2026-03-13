"use client";

import React from "react";
import type { TradeLeg } from "../../types";

interface Props {
  leg: TradeLeg;
  onBack: () => void;
  onConfirm: () => void;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function fmtNum(n: number | null | undefined, dec = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-CH", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-gray-100 last:border-0">
      <span className="w-48 shrink-0 text-xs text-gray-500">{label}</span>
      <span className="text-sm text-gray-800 font-medium">{value}</span>
    </div>
  );
}

export default function Step2LegPreview({ leg, onBack, onConfirm }: Props) {
  const isClientBuy = leg.direction === "sell";
  const sizeLabel = leg.settlementType === "units" ? "Number of Units" : "Notional";
  const priceLabel = leg.settlementType === "units" ? "Price per Unit" : "Price (%)";
  const sizeValue =
    leg.settlementType === "units"
      ? `${fmtNum(leg.numberOfUnits, 0)} units`
      : `${leg.currency} ${fmtNum(leg.notional)}`;
  const priceValue =
    leg.settlementType === "units"
      ? `${leg.currency} ${fmtNum(leg.clientPrice)} per unit`
      : `${fmtNum(leg.clientPrice)}%`;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Leg Preview</h2>
        <p className="text-sm text-gray-500 mt-0.5">Review the selected leg before proceeding</p>
      </div>

      <div className="rounded-xl border border-gray-200 overflow-hidden">
        {/* Direction badge */}
        <div
          className={[
            "px-4 py-2.5 font-bold text-sm tracking-wide text-center",
            isClientBuy ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700",
          ].join(" ")}
        >
          {isClientBuy ? "CLIENT BUY" : "CLIENT SELL"}
        </div>

        <div className="px-4 py-3 space-y-0">
          <Row label="Trade Reference" value={leg.tradeRef} />
          <Row label="ISIN" value={<span className="font-mono">{leg.isin}</span>} />
          <Row label="Product" value={leg.productName} />
          <Row label="Booking Entity" value={leg.bookingEntity} />
          <Row label="Distribution Entity" value={leg.distributingEntity} />
          <Row label="Trade Date" value={fmtDate(leg.tradeDate)} />
          <Row label="Value / Settlement Date" value={fmtDate(leg.valueDate)} />
          <Row label="Currency" value={leg.currency} />
          <Row label={sizeLabel} value={sizeValue} />
          <Row label={priceLabel} value={priceValue} />
          <Row
            label="Net Amount"
            value={
              <span className="text-[#2E5FA3] font-bold">
                {leg.currency} {fmtNum(leg.netAmount)}
              </span>
            }
          />
        </div>
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
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-teal-500 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 transition"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
