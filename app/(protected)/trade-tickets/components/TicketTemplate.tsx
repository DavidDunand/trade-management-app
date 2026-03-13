"use client";

import React from "react";
import type { TradeLeg, ClientContact, AppUser } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function fmtNumber(n: number | null | undefined, decimals = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-CH", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ background: "#1A2A4A", color: "#fff", fontWeight: 700, fontSize: 11, padding: "6px 12px", letterSpacing: "0.04em" }}
    >
      {children}
    </div>
  );
}

function DataRow({
  label,
  value,
  isNetAmount = false,
}: {
  label: string;
  value: React.ReactNode;
  isNetAmount?: boolean;
}) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid #E5E7EB" }}>
      <div
        style={{
          width: "50%",
          padding: "6px 12px",
          fontSize: 11,
          color: isNetAmount ? "#fff" : "#6B7280",
          background: isNetAmount ? "#2E5FA3" : "#F9FAFB",
          fontWeight: isNetAmount ? 600 : 400,
        }}
      >
        {label}
      </div>
      <div
        style={{
          width: "50%",
          padding: "6px 12px",
          fontSize: 11,
          color: isNetAmount ? "#2E5FA3" : "#1F2937",
          background: isNetAmount ? "#EBF0F8" : "#fff",
          fontWeight: isNetAmount ? 700 : 400,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface Props {
  leg: TradeLeg;
  contact: ClientContact;
  user: AppUser;
  /** Optional ref for html-to-image capture */
  containerRef?: React.RefObject<HTMLDivElement>;
}

export default function TicketTemplate({ leg, contact, user, containerRef }: Props) {
  const isValeur = leg.distributingEntity === "Valeur Securities AG, Switzerland";
  const isClientBuy = leg.direction === "sell"; // dealer sells → CLIENT BUY

  const sizeLabel = leg.settlementType === "units" ? "Number of Units" : "Notional";
  const priceLabel = leg.settlementType === "units" ? "Price per Unit" : "Price (%)";
  const sizeValue =
    leg.settlementType === "units"
      ? `${fmtNumber(leg.numberOfUnits, 0)} units`
      : `${leg.currency} ${fmtNumber(leg.notional)}`;
  const priceValue =
    leg.settlementType === "units"
      ? `${leg.currency} ${fmtNumber(leg.clientPrice)} per unit`
      : `${fmtNumber(leg.clientPrice)}%`;

  const dealerBlock = {
    legalName: leg.dealerLegalName,
    ssi: isValeur ? "Euroclear 41420" : (leg.dealerSSI ?? "—"),
    contact: isValeur
      ? "jacopo.bini@valeur.ch | andrea.coia@valeur.ch"
      : `${user.name} \u00B7 ${user.email}`,
  };
  const clientBlock = {
    legalName: leg.counterpartyLegalName,
    ssi: leg.counterpartySSI ?? "—",
    contact: contact.email,
  };
  const buyerBlock = isClientBuy ? clientBlock : dealerBlock;
  const sellerBlock = isClientBuy ? dealerBlock : clientBlock;

  const footerText = isValeur
    ? "This document has been produced by Valeur Securities AG"
    : "This document has been produced by RiverRock Securities SAS";

  const directionBg = isClientBuy ? "#D1FAE5" : "#FEE2E2";
  const directionFg = isClientBuy ? "#065F46" : "#991B1B";
  const directionText = isClientBuy ? "CLIENT BUY" : "CLIENT SELL";

  return (
    <div
      ref={containerRef}
      style={{
        fontFamily: "Calibri, Arial, sans-serif",
        fontSize: 12,
        color: "#1F2937",
        width: 640,
        background: "#fff",
        border: "1px solid #E5E7EB",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "#1A2A4A",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "19px 20px",
        }}
      >
        <div>
          {isValeur ? (
            /* Logo replaces "VALEUR SECURITIES AG" text for Valeur tickets.
               brightness(0) invert(1) turns the dark-navy SVG paths white. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/valeur-logo.svg"
              alt="Valeur"
              style={{ height: 32, display: "block", filter: "brightness(0) invert(1)" }}
            />
          ) : (
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              <span style={{ color: "#fff" }}>RIVERROCK</span>
              <span style={{ color: "#A8B9D4" }}> SECURITIES SAS</span>
            </div>
          )}
          <div style={{ color: "#A8B9D4", fontSize: 10, marginTop: 4 }}>Trade Confirmation</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{leg.isin}</div>
          <div style={{ color: "#A8B9D4", fontSize: 10, fontStyle: "italic", marginTop: 2 }}>{leg.productName}</div>
        </div>
      </div>

      {/* Client info */}
      <div style={{ borderBottom: "2px solid #E5E7EB" }}>
        <DataRow label="Client Name" value={leg.clientName} />
        <DataRow label="Contact" value={contact.name} />
        <DataRow label="Email" value={contact.email} />
      </div>

      {/* Direction badge */}
      <div
        style={{
          background: directionBg,
          color: directionFg,
          fontWeight: 700,
          textAlign: "center",
          padding: "8px 0",
          fontSize: 12,
          letterSpacing: "0.06em",
        }}
      >
        {directionText}
      </div>

      {/* Trade economics */}
      <div style={{ borderTop: "2px solid #E5E7EB" }}>
        <SectionBar>Trade Economics</SectionBar>
        <DataRow label="Trade Date" value={fmtDate(leg.tradeDate)} />
        <DataRow label="Value / Settlement Date" value={fmtDate(leg.valueDate)} />
        <DataRow label="Currency" value={leg.currency} />
        <DataRow label={sizeLabel} value={sizeValue} />
        <DataRow label={priceLabel} value={priceValue} />
        <DataRow
          label="Net Amount"
          value={`${leg.currency} ${fmtNumber(leg.netAmount)}`}
          isNetAmount
        />
      </div>

      {/* Settlement instructions */}
      <div style={{ borderTop: "2px solid #E5E7EB" }}>
        <SectionBar>Settlement Instructions</SectionBar>

        <div style={{ background: "#F1F5F9", borderBottom: "1px solid #E5E7EB" }}>
          <div style={{ padding: "4px 12px", fontSize: 10, fontWeight: 700, color: "#1A2A4A", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            Buyer
          </div>
        </div>
        <DataRow label="Legal Name" value={buyerBlock.legalName} />
        <DataRow label="Account / SSI" value={buyerBlock.ssi} />
        <DataRow label="Contact" value={buyerBlock.contact} />

        <div style={{ background: "#F1F5F9", borderBottom: "1px solid #E5E7EB", borderTop: "1px solid #E5E7EB" }}>
          <div style={{ padding: "4px 12px", fontSize: 10, fontWeight: 700, color: "#1A2A4A", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
            Seller
          </div>
        </div>
        <DataRow label="Legal Name" value={sellerBlock.legalName} />
        <DataRow label="Account / SSI" value={sellerBlock.ssi} />
        <DataRow label="Contact" value={sellerBlock.contact} />
      </div>

      {/* Footer */}
      <div
        style={{
          background: "#F9FAFB",
          borderTop: "1px solid #E5E7EB",
          padding: "8px 12px",
          textAlign: "center",
          fontSize: 9,
          color: "#6B7280",
          fontStyle: "italic",
        }}
      >
        {footerText}
      </div>
    </div>
  );
}
