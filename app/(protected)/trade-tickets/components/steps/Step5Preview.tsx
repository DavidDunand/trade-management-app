"use client";

import { useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import TicketTemplate from "../TicketTemplate";
import type { TradeLeg, ClientContact, AppUser } from "../../types";

interface Props {
  leg: TradeLeg;
  contact: ClientContact;
  custodianContact?: ClientContact | null;
  user: AppUser;
  onBack: () => void;
  onNext: () => void;
  /** Expose the ticket element ref for PNG capture */
  ticketRef?: React.RefObject<HTMLDivElement>;
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

function PanelSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 text-left"
      >
        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          {title}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        )}
      </button>
      {open && <div className="px-3 py-2 space-y-1">{children}</div>}
    </div>
  );
}

function MiniRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1 border-b border-gray-100 last:border-0">
      <span className="text-[10px] text-gray-400 w-32 shrink-0 pt-0.5">{label}</span>
      <span className="text-[11px] text-gray-700 font-medium flex-1 min-w-0 break-words">{value}</span>
    </div>
  );
}

export default function Step5Preview({ leg, contact, custodianContact, user, onBack, onNext, ticketRef }: Props) {
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = ticketRef ?? internalRef;

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

  const dealerSSIDisplay =
    leg.distributingEntity === "Valeur Securities AG, Switzerland"
      ? "Euroclear 41420"
      : (leg.dealerSSI ?? "—");
  const dealerContact =
    leg.distributingEntity === "Valeur Securities AG, Switzerland"
      ? "jacopo.bini@valeur.ch | andrea.coia@valeur.ch"
      : `${user.name} · ${user.email}`;

  const dealerBlock = { legalName: leg.dealerLegalName, ssi: dealerSSIDisplay, contact: dealerContact };
  const clientBlockData = { legalName: leg.counterpartyLegalName, ssi: leg.counterpartySSI ?? "—", contact: custodianContact?.email ?? "" };
  const buyerBlock = isClientBuy ? clientBlockData : dealerBlock;
  const sellerBlock = isClientBuy ? dealerBlock : clientBlockData;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Ticket Preview</h2>
        <p className="text-sm text-gray-500 mt-0.5">Review the ticket before generating the final document</p>
      </div>

      {/* Ticket preview — full width */}
      <div className="overflow-x-auto">
        <TicketTemplate
          leg={leg}
          contact={contact}
          custodianContact={custodianContact}
          user={user}
          containerRef={ref as React.RefObject<HTMLDivElement>}
        />
      </div>

      {/* Trade Data + Settlement cards — side by side below the ticket */}
      <div className="grid grid-cols-2 gap-3">
        <PanelSection title="Trade Data">
          <MiniRow label="Reference" value={leg.tradeRef} />
          <MiniRow label="ISIN" value={<span className="font-mono">{leg.isin}</span>} />
          <MiniRow label="Trade Date" value={fmtDate(leg.tradeDate)} />
          <MiniRow label="Value Date" value={fmtDate(leg.valueDate)} />
          <MiniRow label="Currency" value={leg.currency} />
          <MiniRow label={sizeLabel} value={sizeValue} />
          <MiniRow label={priceLabel} value={priceValue} />
          <MiniRow label="Net Amount" value={<span className="font-bold text-[#2E5FA3]">{leg.currency} {fmtNum(leg.netAmount)}</span>} />
          <MiniRow label="Direction" value={
            <span className={isClientBuy ? "text-green-700 font-bold" : "text-red-700 font-bold"}>
              {isClientBuy ? "YOU BUY" : "YOU SELL"}
            </span>
          } />
          <MiniRow label="Contact" value={`${contact.name} (${contact.email})`} />
        </PanelSection>

        <PanelSection title="Settlement" defaultOpen={true}>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-1">Buyer</p>
          <MiniRow label="Legal Name" value={buyerBlock.legalName} />
          <MiniRow label="SSI" value={buyerBlock.ssi} />
          <MiniRow label="Contact" value={buyerBlock.contact} />
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mt-2">Seller</p>
          <MiniRow label="Legal Name" value={sellerBlock.legalName} />
          <MiniRow label="SSI" value={sellerBlock.ssi} />
          <MiniRow label="Contact" value={sellerBlock.contact} />
        </PanelSection>
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
          onClick={onNext}
          className="flex-1 rounded-lg bg-teal-500 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 transition"
        >
          Continue to Export
        </button>
      </div>
    </div>
  );
}
