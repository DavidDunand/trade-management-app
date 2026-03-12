// ─── Core domain types ────────────────────────────────────────────────────────

export type BookingEntity =
  | "Valeur Securities AG, Switzerland"
  | "RiverRock Securities SAS, France";

export type SettlementType = "percent" | "units";

export interface TradeLeg {
  id: string;
  tradeRef: string;
  isin: string;
  productName: string;
  /** Dealer perspective: 'buy' = dealer buys from client, 'sell' = dealer sells to client */
  direction: "buy" | "sell";
  tradeDate: string; // ISO date YYYY-MM-DD
  valueDate: string;
  currency: string;
  settlementType: SettlementType;
  /** Filled when settlementType = 'percent' */
  notional?: number;
  /** Filled when settlementType = 'units' */
  numberOfUnits?: number;
  /** % when percent settlement; per-unit price when units settlement */
  clientPrice?: number;
  netAmount: number;
  /** Client name from trades.client_name — displayed in the ticket header */
  clientName: string;
  /** Actual booking entity — displayed in Step 2 */
  bookingEntity: BookingEntity;
  /** Distributing entity — drives template header, footer, and dealer SSI block */
  distributingEntity: BookingEntity;
  dealerLegalName: string;
  /** Valeur: hardcoded "Euroclear 41420". RiverRock: opposite-direction leg's counterparty SSI */
  dealerSSI?: string;
  counterpartyLegalName: string;
  counterpartySSI?: string;
  clientId: string;
}

export interface ClientContact {
  id: string;
  name: string;
  email: string;
  isPrimary: boolean;
}

export interface Client {
  id: string;
  name: string;
  contacts: ClientContact[];
}

export interface AppUser {
  name: string;
  email: string;
}

// ─── Search result types ──────────────────────────────────────────────────────

export interface SearchLeg {
  legId: string;
  /** 'buy' | 'sell' from dealer perspective */
  direction: "buy" | "sell";
  counterpartyName: string;
  size: number | null;
  status: string;
}

export interface SearchTrade {
  tradeId: string;
  tradeRef: string;
  isin: string;
  productName: string;
  tradeDate: string;
  clientName: string;
  legs: SearchLeg[];
}

// ─── Validation check types ───────────────────────────────────────────────────

export type CheckLevel = "ok" | "warning" | "error";

export interface ValidationCheck {
  label: string;
  level: CheckLevel;
  detail?: string;
  actionLabel?: string;
  actionHref?: string;
}

// ─── Generated ticket history ─────────────────────────────────────────────────

export interface TicketRecord {
  id: string;
  format: "docx" | "pdf" | "png";
  generatedBy: string;
  createdAt: string;
}

// ─── Wizard state ─────────────────────────────────────────────────────────────

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export interface WizardState {
  step: WizardStep;
  selectedLeg: TradeLeg | null;
  selectedContact: ClientContact | null;
  client: Client | null;
}
