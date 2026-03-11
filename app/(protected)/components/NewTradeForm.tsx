"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";

type ModalMode = "new" | "edit" | "clone";

type Product = {
  id: string;
  isin: string;
  valoren: string | null;
  product_name: string;
  currency: string;
  maturity_date: string | null;
  settlement: "percent" | "units";
  issuer: { id: string; legal_name: string } | null;
};

type Counterparty = {
  id: string;
  legal_name: string;
  cp_type: "issuer_dealer" | "custodian" | "internal" | "other";
};

type GroupEntity = { id: string; legal_name: string };

type Advisor = { id: string; legal_name: string; advisor_type: "client" | "introducer" };
type AdvisorContact = { id: string; advisor_id: string; first_name: string; family_name: string; email: string | null };
type SalesPerson = { id: string; first_name: string; family_name: string };

type LegDraft = {
  id: string;
  side: "buy" | "sell"; // DB values (Seller=buy, Buyer=sell)
  counterparty_id: string;
  counterparty_text: string;
  size: string;
};

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

// accepts 1,000,000 | 1'000'000 | 1 000 000 | 1000000
function numOrNull(v: string) {
  const t = v.trim();
  if (!t) return null;
  const normalized = t.replace(/[,\s']/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// Check if input is a valid entry
function isValidName(value: string, list: string[]) {
  return list.includes(value.trim());
}

// Enforce correct capitalization / match from list on blur
function enforceValidName(value: string, list: string[]): string {
  const match = list.find((n) => n.toLowerCase() === value.trim().toLowerCase());
  return match ?? "";
}


// Swiss-style formatting: 1'000'000.00
function formatSwissFromString(v: string, decimals = 2) {
  const n = numOrNull(v);
  if (n === null) return v;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const fixed = abs.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return decimals > 0 ? `${sign}${withSep}.${decPart}` : `${sign}${withSep}`;
}

function formatSwiss2(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "-";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return `${sign}${withSep}.${decPart}`;
}

function isRiverRockEntityName(name: string) {
  return name.toLowerCase().includes("riverrock securities sas");
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white overflow-hidden">
      <div className="px-4 py-3 bg-black/5 font-bold">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function NewTradeForm({
  mode,
  sourceTradeId,
  onCancel,
  onSaved,
  variant = "page",
}: {
  mode: ModalMode;
  sourceTradeId: string | null;
  onCancel: () => void;
  onSaved: () => void;
  variant?: "modal" | "page";
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [entities, setEntities] = useState<GroupEntity[]>([]);
  const [clients, setClients] = useState<Advisor[]>([]);
  const [introducers, setIntroducers] = useState<Advisor[]>([]);
  const [salesPeople, setSalesPeople] = useState<SalesPerson[]>([]);
  const [clientContacts, setClientContacts] = useState<AdvisorContact[]>([]);
  const [introducerContacts, setIntroducerContacts] = useState<AdvisorContact[]>([]);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [isinInput, setIsinInput] = useState("");
  const [productId, setProductId] = useState<string>("");

  const [tradeDate, setTradeDate] = useState("");
  const [valueDate, setValueDate] = useState("");

  const [transactionType, setTransactionType] = useState<"primary" | "increase" | "unwind">("primary");

  const [sellerPrice, setSellerPrice] = useState(""); // buy_price
  const [buyerPrice, setBuyerPrice] = useState(""); // sell_price

  const [totalSize, setTotalSize] = useState("");

  const [bookingEntityId, setBookingEntityId] = useState("");
  const [distributingEntityId, setDistributingEntityId] = useState("");

  const [bookingTimestamp, setBookingTimestamp] = useState("");
  const [reportable, setReportable] = useState(false);

  const [retroClientInput, setRetroClientInput] = useState("");
  const [retroIntroducerInput, setRetroIntroducerInput] = useState("");
  const [feeCustodianInput, setFeeCustodianInput] = useState("");

  const [clientName, setClientName] = useState("");
  const [introducerName, setIntroducerName] = useState("");
  const [salesName, setSalesName] = useState("");

  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedIntroducerId, setSelectedIntroducerId] = useState<string | null>(null);

  const [clientContactId, setClientContactId] = useState<string>("");
  const [introducerContactId, setIntroducerContactId] = useState<string>("");

  const [lastClientId, setLastClientId] = useState<string | null>(null);
  const [lastIntroducerId, setLastIntroducerId] = useState<string | null>(null);

  const [legs, setLegs] = useState<LegDraft[]>([
    { id: uid(), side: "buy", counterparty_id: "", counterparty_text: "", size: "" },
    { id: uid(), side: "sell", counterparty_id: "", counterparty_text: "", size: "" },
  ]);

  const selectedProduct = useMemo(() => products.find((p) => p.id === productId) ?? null, [products, productId]);
  const selectedBookingEntity = useMemo(
    () => entities.find((e) => e.id === bookingEntityId) ?? null,
    [entities, bookingEntityId]
  );

  const settlement = selectedProduct?.settlement ?? "percent";
  const currency = selectedProduct?.currency ?? "";

  const totalSizeNum = numOrNull(totalSize) ?? 0;
  const sellerPriceNum = numOrNull(sellerPrice);
  const buyerPriceNum = numOrNull(buyerPrice);

  const sumSeller = useMemo(
    () => legs.filter((l) => l.side === "buy").reduce((acc, l) => acc + (numOrNull(l.size) ?? 0), 0),
    [legs]
  );
  const sumBuyer = useMemo(
    () => legs.filter((l) => l.side === "sell").reduce((acc, l) => acc + (numOrNull(l.size) ?? 0), 0),
    [legs]
  );

  const sizesOk =
    totalSizeNum > 0 &&
    Math.abs(sumSeller - totalSizeNum) < 1e-9 &&
    Math.abs(sumBuyer - totalSizeNum) < 1e-9;

  const grossFees = useMemo(() => {
    if (sellerPriceNum === null || buyerPriceNum === null || totalSizeNum <= 0) return null;
    const isUnwind = (transactionType ?? "").toLowerCase() === "unwind";
    const diff = isUnwind ? sellerPriceNum - buyerPriceNum : buyerPriceNum - sellerPriceNum;
    if (settlement === "percent") return (diff / 100) * totalSizeNum;
    return diff * totalSizeNum;
  }, [sellerPriceNum, buyerPriceNum, totalSizeNum, settlement, transactionType]);

  const retroClientAmt = useMemo(() => {
    const v = numOrNull(retroClientInput);
    if (v === null || totalSizeNum <= 0) return 0;
    return settlement === "percent" ? (v / 100) * totalSizeNum : v * totalSizeNum;
  }, [retroClientInput, settlement, totalSizeNum]);

  const retroIntroducerAmt = useMemo(() => {
    const v = numOrNull(retroIntroducerInput);
    if (v === null || totalSizeNum <= 0) return 0;
    return settlement === "percent" ? (v / 100) * totalSizeNum : v * totalSizeNum;
  }, [retroIntroducerInput, settlement, totalSizeNum]);

  const feeCustodianAmt = useMemo(() => {
    const v = numOrNull(feeCustodianInput);
    if (v === null || totalSizeNum <= 0) return 0;
    return settlement === "percent" ? (v / 100) * totalSizeNum : v * totalSizeNum;
  }, [feeCustodianInput, settlement, totalSizeNum]);

  const pnlTradeCcy = useMemo(() => {
    if (grossFees === null) return null;
    return grossFees - retroClientAmt - retroIntroducerAmt - feeCustodianAmt;
  }, [grossFees, retroClientAmt, retroIntroducerAmt, feeCustodianAmt]);

  const showTimestampWarning = useMemo(() => {
    const name = selectedBookingEntity?.legal_name ?? "";
    return !!name && isRiverRockEntityName(name) && !bookingTimestamp;
  }, [selectedBookingEntity, bookingTimestamp]);

  const allLegsOk = useMemo(() => {
    if (legs.length < 2) return false;
    return legs.every((l) => !!l.counterparty_id && (numOrNull(l.size) ?? 0) > 0);
  }, [legs]);

const canSave =
  !!selectedProduct &&
  !!tradeDate &&
  !!transactionType &&
  !!bookingEntityId &&
  !!distributingEntityId &&
  !!salesName.trim() &&
  isValidName(clientName, clients.map(c => c.legal_name)) &&
  isValidName(introducerName, introducers.map(i => i.legal_name)) &&
  isValidName(salesName, salesPeople.map(s => `${s.first_name} ${s.family_name}`)) &&
  totalSizeNum > 0 &&
  sellerPriceNum !== null &&
  buyerPriceNum !== null &&
  sizesOk &&
  allLegsOk &&
  (!reportable || !!bookingTimestamp);

  // load refs
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: c }, { data: e }, { data: adv }, { data: sp }] = await Promise.all([
        supabase
          .from("products")
          .select("id, isin, valoren, product_name, currency, maturity_date, settlement, issuer:issuer_id(id, legal_name)")
          .eq("archived", false)
          .order("created_at", { ascending: false }),
        supabase.from("counterparties").select("id, legal_name, cp_type").order("legal_name"),
        supabase.from("group_entities").select("id, legal_name").order("legal_name"),
        supabase.from("advisors").select("id, legal_name, advisor_type").order("legal_name"),
        supabase.from("sales_people").select("id, first_name, family_name").order("family_name"),
      ]);

      setProducts((p as any) ?? []);
      setCounterparties((c as any) ?? []);
      setEntities((e as any) ?? []);

      const advisors: Advisor[] = ((adv as any) ?? []).map((a: any) => ({
        id: a.id,
        legal_name: a.legal_name,
        advisor_type: a.advisor_type,
      }));
      setClients(advisors.filter((a) => a.advisor_type === "client"));
      setIntroducers(advisors.filter((a) => a.advisor_type === "introducer"));

      setSalesPeople(((sp as any) ?? []).map((x: any) => ({ id: x.id, first_name: x.first_name, family_name: x.family_name })));

      setLoading(false);
    })();
  }, []);

  // load trade for edit/clone (page or modal)
  useEffect(() => {
    if (!sourceTradeId) return;

    (async () => {
      setLoading(true);

      const { data: trade, error: tErr } = await supabase
        .from("trades")
        .select(
          `
          id,
          trade_date,
          value_date,
          transaction_type,
          product_id,
          reference,
          booking_entity_id,
          distributing_entity_id,
          buy_price,
          sell_price,
          total_size,
          booking_timestamp,
          reportable,
          client_name,
          introducer_name,
          sales_name,
          retro_client_input,
          retro_introducer_input,
          fee_custodian_input,
          client_contact_id,
          introducer_contact_id
        `
        )
        .eq("id", sourceTradeId)
        .single();

      if (tErr) {
        setLoading(false);
        alert(tErr.message);
        return;
      }

      const { data: legsDb, error: lErr } = await supabase
        .from("trade_legs")
        .select("id, leg, counterparty_id, size")
        .eq("trade_id", sourceTradeId)
        .order("created_at", { ascending: true });

      if (lErr) {
        setLoading(false);
        alert(lErr.message);
        return;
      }

      setProductId(trade.product_id ?? "");
      const prod = products.find((p) => p.id === trade.product_id);
      setIsinInput(prod?.isin ?? "");

      setTradeDate(trade.trade_date ?? "");
      setValueDate(trade.value_date ?? "");
      setTransactionType((trade.transaction_type ?? "primary") as any);

const isUnwind = (trade.transaction_type ?? "").toLowerCase() === "unwind";

if (isUnwind) {
  setSellerPrice(trade.sell_price != null ? String(trade.sell_price) : "");
  setBuyerPrice(trade.buy_price != null ? String(trade.buy_price) : "");
} else {
  setSellerPrice(trade.buy_price != null ? String(trade.buy_price) : "");
  setBuyerPrice(trade.sell_price != null ? String(trade.sell_price) : "");
}
      setTotalSize(trade.total_size != null ? String(trade.total_size) : "");

      setBookingEntityId(trade.booking_entity_id ?? "");
      setDistributingEntityId(trade.distributing_entity_id ?? "");

      setBookingTimestamp(
  trade.booking_timestamp
    ? trade.booking_timestamp.slice(0, 16)
    : ""
);
      setReportable(!!trade.reportable);

      setClientName(trade.client_name ?? "");
      setIntroducerName(trade.introducer_name ?? "");
      setSalesName(trade.sales_name ?? "");

      setRetroClientInput(trade.retro_client_input != null ? String(trade.retro_client_input) : "");
      setRetroIntroducerInput(trade.retro_introducer_input != null ? String(trade.retro_introducer_input) : "");
      setFeeCustodianInput(trade.fee_custodian_input != null ? String(trade.fee_custodian_input) : "");

      setClientContactId(trade.client_contact_id ?? "");
      setIntroducerContactId(trade.introducer_contact_id ?? "");

      const drafts: LegDraft[] = (legsDb ?? []).map((l: any) => {
        const cp = counterparties.find((c) => c.id === l.counterparty_id);
        return {
          id: uid(),
          side: l.leg,
          counterparty_id: l.counterparty_id ?? "",
          counterparty_text: cp?.legal_name ?? "",
          size: l.size != null ? String(l.size) : "",
        };
      });

      setLegs(
        drafts.length
          ? drafts
          : [
              { id: uid(), side: "buy", counterparty_id: "", counterparty_text: "", size: "" },
              { id: uid(), side: "sell", counterparty_id: "", counterparty_text: "", size: "" },
            ]
      );

      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceTradeId, products, counterparties]);

  // contacts: client
  useEffect(() => {
    (async () => {
      const found = clients.find((c) => c.legal_name === clientName);
      const id = found?.id ?? null;

      setSelectedClientId(id);
      setClientContacts([]);

      if (!id) {
        setLastClientId(null);
        setClientContactId("");
        return;
      }

      if (lastClientId !== id) {
        setClientContactId("");
        setLastClientId(id);
      }

      const { data, error } = await supabase
        .from("advisor_contacts")
        .select("id, advisor_id, first_name, family_name, email")
        .eq("advisor_id", id)
        .order("created_at");

      if (error) console.error(error);
      setClientContacts((data as any) ?? []);
    })();
  }, [clientName, clients, lastClientId]);

  // contacts: introducer
  useEffect(() => {
    (async () => {
      const found = introducers.find((c) => c.legal_name === introducerName);
      const id = found?.id ?? null;

      setSelectedIntroducerId(id);
      setIntroducerContacts([]);

      if (!id) {
        setLastIntroducerId(null);
        setIntroducerContactId("");
        return;
      }

      if (lastIntroducerId !== id) {
        setIntroducerContactId("");
        setLastIntroducerId(id);
      }

      const { data, error } = await supabase
        .from("advisor_contacts")
        .select("id, advisor_id, first_name, family_name, email")
        .eq("advisor_id", id)
        .order("created_at");

      if (error) console.error(error);
      setIntroducerContacts((data as any) ?? []);
    })();
  }, [introducerName, introducers, lastIntroducerId]);

  const productSuggestions = useMemo(() => {
    const q = isinInput.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products
      .filter((p) => p.isin.toLowerCase().includes(q) || p.product_name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [isinInput, products]);

  function setLegField(id: string, patch: Partial<LegDraft>) {
    setLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLeg(side: "buy" | "sell") {
    setLegs((prev) => [...prev, { id: uid(), side, counterparty_id: "", counterparty_text: "", size: "" }]);
  }

  function removeLeg(id: string) {
    setLegs((prev) => prev.filter((l) => l.id !== id));
  }

  async function save() {
    if (!canSave) return;

    setSaving(true);

    try {
      const gross_fees = grossFees;
      const retro_client_amt = retroClientAmt;
      const retro_introducer_amt = retroIntroducerAmt;
      const fee_custodian_amt = feeCustodianAmt;
      const pnl_trade_ccy = pnlTradeCcy;


      const tradePatch: any = {
        transaction_type: transactionType,
        trade_date: tradeDate,
        value_date: valueDate || null,
        product_id: productId,
        booking_entity_id: bookingEntityId,
        distributing_entity_id: distributingEntityId,
        buy_price: transactionType === "unwind" ? buyerPriceNum : sellerPriceNum,
        sell_price: transactionType === "unwind" ? sellerPriceNum : buyerPriceNum,
        total_size: totalSizeNum,
        gross_fees,
        retro_client_input: numOrNull(retroClientInput),
        retro_introducer_input: numOrNull(retroIntroducerInput),
        fee_custodian_input: numOrNull(feeCustodianInput),
        retro_client: retro_client_amt,
        retro_introducer: retro_introducer_amt,
        fee_custodian: fee_custodian_amt,
        pnl_trade_ccy,
        booking_timestamp: bookingTimestamp || null,
        reportable,
        client_name: clientName || null,
        introducer_name: introducerName || null,
        sales_name: salesName || null,
        client_contact_id: clientContactId || null,
        introducer_contact_id: introducerContactId || null,
        ...(mode !== "edit" ? { status: "pending" } : {}),
      };

      let tradeId: string;

      if (mode === "edit" && sourceTradeId) {
        const { error } = await supabase.from("trades").update(tradePatch).eq("id", sourceTradeId);
        if (error) throw error;
        tradeId = sourceTradeId;

        const { error: delErr } = await supabase.from("trade_legs").delete().eq("trade_id", tradeId);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase.from("trades").insert(tradePatch).select("id").single();
        if (error) throw error;
        tradeId = data.id;
      }

      const legsPayload = legs.map((l) => ({
        trade_id: tradeId,
        leg: l.side,
        counterparty_id: l.counterparty_id,
        currency,
        size: numOrNull(l.size) ?? 0,
        price: 0,
        settlement,
        status: "pending",
      }));

      const { error: legErr } = await supabase.from("trade_legs").insert(legsPayload);
      if (legErr) throw legErr;

      onSaved();
    } catch (e: any) {
      alert(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  }

  const title =
    mode === "new" ? "New Trade" : mode === "edit" ? "Modify Pending Trade" : "Clone Trade";
  const saveLabel = mode === "edit" ? "Modify pending trade" : "Save pending trade";

  const totalSizeLabel = settlement === "percent" ? "Total Size (notional)" : "Total Size (# of units)";
  const totalSizeDecimals = settlement === "percent" ? 2 : 0;

  const reofferLabel = settlement === "units" ? "Reoffer Price per unit" : "Reoffer Price";
  const clientPriceLabel = settlement === "units" ? "Client Price per unit" : "Client Price";

  const retroClientLabel =
    settlement === "units" ? "Retro Client (amount per unit)" : "Retro Client (% of notional)";
  const retroIntroducerLabel =
    settlement === "units" ? "Retro Introducer (amount per unit)" : "Retro Introducer (% of notional)";
  const custodianFeeLabel =
    settlement === "units" ? "Custodian Fee (amount per unit)" : "Custodian Fee (% of notional)";
  const retroClientAmtLabel = "Retro Client:";
  const retroIntroducerAmtLabel = "Retro Introducer:";
  const content = (
    <>
      <div className="px-5 py-4 bg-[hsl(var(--primary))] text-white flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">{title}</div>
          <div className="text-xs text-white/80">Status: Pending</div>
        </div>
        <button onClick={onCancel} className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15">
          Close
        </button>
      </div>

      <div className="p-5 space-y-4 bg-black/[0.02]">
        {loading ? (
          <div className="text-sm font-bold text-black/60">Loading…</div>
        ) : (
          <>
            {/* Product & Dates */}
            <Section title="Product & Dates">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* ISIN */}
                <div className="md:col-span-5">
                  <div className="text-sm font-bold mb-1">ISIN (typeahead)</div>
                  <input
                    value={isinInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      setIsinInput(v);
                      const match = products.find((p) => p.isin.toLowerCase() === v.trim().toLowerCase());
                      setProductId(match ? match.id : "");
                    }}
                    placeholder="Type ISIN…"
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                    list="isin_list"
                  />
                  <datalist id="isin_list">
                    {productSuggestions.map((p) => (
                      <option key={p.id} value={p.isin}>
                        {p.product_name}
                      </option>
                    ))}
                  </datalist>

                  {selectedProduct && (
                    <div className="mt-2 text-xs text-black/70">
                      <div className="font-bold">{selectedProduct.product_name}</div>
                      <div>{selectedProduct.issuer?.legal_name ?? "-"}</div>
                      <div>
                        {selectedProduct.currency} • {selectedProduct.settlement} • Maturity:{" "}
                        {selectedProduct.maturity_date ?? "-"}
                      </div>
                    </div>
                  )}
                </div>

                {/* Type */}
                <div className="md:col-span-3">
                  <div className="text-sm font-bold mb-1">Type</div>
                  <select
                    value={transactionType}
                    onChange={(e) => setTransactionType(e.target.value as any)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                  >
                    <option value="primary">Primary</option>
                    <option value="increase">Increase</option>
                    <option value="unwind">Unwind</option>
                  </select>
                  <div className="mt-2 text-xs text-black/50 font-bold">
                    {transactionType === "unwind"
                      ? "Unwind: economics uses (Reoffer - Client)."
                      : "Primary/Increase: economics uses (Client - Reoffer)."}
                  </div>
                </div>

                {/* Total Size */}
                <div className="md:col-span-4">
                  <div className="text-sm font-bold mb-1">{totalSizeLabel}</div>
                  <input
                    value={totalSize}
                    onChange={(e) => setTotalSize(e.target.value)}
                    onBlur={() => setTotalSize((v) => formatSwissFromString(v, totalSizeDecimals))}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                    placeholder={settlement === "percent" ? "e.g. 1000000" : "e.g. 1500"}
                  />
                  {!sizesOk && totalSizeNum > 0 ? (
                    <div className="mt-2 text-xs font-bold text-red-700">
                      Sizes mismatch: Seller sum {formatSwiss2(sumSeller)} / Buyer sum {formatSwiss2(sumBuyer)} must
                      equal Total Size {formatSwiss2(totalSizeNum)}
                    </div>
                  ) : null}
                </div>

                {/* Trade Date */}
                <div className="md:col-span-3">
                  <div className="text-sm font-bold mb-1">Trade Date</div>
                  <input
                    type="date"
                    value={tradeDate}
                    onChange={(e) => setTradeDate(e.target.value)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                  />
                </div>

                {/* Value Date */}
                <div className="md:col-span-3">
                  <div className="text-sm font-bold mb-1">Value Date</div>
                  <input
                    type="date"
                    value={valueDate}
                    onChange={(e) => setValueDate(e.target.value)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                  />
                </div>

                {/* Reportable? */}
                <div className="md:col-span-3">
                  <div className="text-sm font-bold mb-1">Reportable?</div>
                  <select
                    value={reportable ? "yes" : "no"}
                    onChange={(e) => setReportable(e.target.value === "yes")}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>

                {/* Timestamp */}
                <div className="md:col-span-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold mb-1">Timestamp</div>
                    {showTimestampWarning && (
                      <div className="text-xs font-bold text-red-700">Required Transaction Reportings</div>
                    )}
                  </div>
                  <input
                    type="datetime-local"
                    value={bookingTimestamp}
                    onChange={(e) => setBookingTimestamp(e.target.value)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                  />
                </div>
              </div>
            </Section>

            {/* Counterparties */}
            <Section title="Counterparties">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Booking Entity */}
                <div className="md:col-span-6">
                  <div className="text-sm font-bold mb-1">Booking Entity</div>
                  <select
                    value={bookingEntityId}
                    onChange={(e) => setBookingEntityId(e.target.value)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                  >
                    <option value="">Select…</option>
                    {entities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.legal_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Distribution Entity */}
                <div className="md:col-span-6">
                  <div className="text-sm font-bold mb-1">Distribution Entity</div>
                  <select
                    value={distributingEntityId}
                    onChange={(e) => setDistributingEntityId(e.target.value)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                  >
                    <option value="">Select…</option>
                    {entities.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.legal_name}
                      </option>
                    ))}
                  </select>
                </div>

{/* Client Name */}
<div className="md:col-span-6">
  <div className="text-sm font-bold mb-1">Client Name <span className="text-red-600">*</span></div>
  <input
    list="clients"
    value={clientName}
    onChange={(e) => setClientName(e.target.value)}
    onBlur={() => setClientName(enforceValidName(clientName, clients.map(c => c.legal_name)))}
    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
    placeholder="Start typing…"
  />
  <datalist id="clients">
    {clients.map((c) => (
      <option key={c.id} value={c.legal_name} />
    ))}
  </datalist>
  {clientName && !isValidName(clientName, clients.map(c => c.legal_name)) && (
    <div className="mt-1 text-xs text-red-600">Select a valid client from the list</div>
  )}
</div>


                {/* Client Contact */}
                <div className="md:col-span-6">
                  <div className="text-sm font-bold mb-1">Client Contact</div>
                  <select
                    value={clientContactId}
                    onChange={(e) => setClientContactId(e.target.value)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                    disabled={!selectedClientId}
                  >
                    <option value="">{selectedClientId ? "Select…" : "Select a client first"}</option>
                    {clientContacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.family_name}
                        {c.email ? ` — ${c.email}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

{/* Introducer Name */}
<div className="md:col-span-6">
  <div className="text-sm font-bold mb-1">Introducer Name</div>
  <input
    list="introducers"
    value={introducerName}
    onChange={(e) => setIntroducerName(e.target.value)}
    onBlur={() => setIntroducerName(enforceValidName(introducerName, introducers.map(i => i.legal_name)))}
    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
    placeholder="Start typing…"
  />
  <datalist id="introducers">
    {introducers.map((i) => (
      <option key={i.id} value={i.legal_name} />
    ))}
  </datalist>
  {introducerName && !isValidName(introducerName, introducers.map(i => i.legal_name)) && (
    <div className="mt-1 text-xs text-red-600">Select a valid introducer from the list</div>
  )}
</div>

                {/* Introducer Contact */}
                <div className="md:col-span-6">
                  <div className="text-sm font-bold mb-1">Introducer Contact</div>
                  <select
                    value={introducerContactId}
                    onChange={(e) => setIntroducerContactId(e.target.value)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                    disabled={!selectedIntroducerId}
                  >
                    <option value="">{selectedIntroducerId ? "Select…" : "Select an introducer first"}</option>
                    {introducerContacts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.family_name}
                        {c.email ? ` — ${c.email}` : ""}
                      </option>
                    ))}
                  </select>
                </div>

{/* Sales Name */}
<div className="md:col-span-6">
  <div className="text-sm font-bold mb-1">
    Sales Name <span className="text-red-600">*</span>
  </div>
  <input
    list="salesPeople"
    value={salesName}
    onChange={(e) => setSalesName(e.target.value)}
    onBlur={() =>
      setSalesName(
        enforceValidName(
          salesName,
          salesPeople.map((s) => `${s.first_name} ${s.family_name}`)
        )
      )
    }
    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
    placeholder="Start typing…"
  />
  <datalist id="salesPeople">
    {salesPeople.map((s) => (
      <option key={s.id} value={`${s.first_name} ${s.family_name}`} />
    ))}
  </datalist>
  {salesName &&
    !isValidName(salesName, salesPeople.map((s) => `${s.first_name} ${s.family_name}`)) && (
      <div className="mt-1 text-xs text-red-600">
          Select a valid salesperson from the list
        </div>
      )}
  </div>
  </div>
</Section>
<Section title="Pricing & Fees">
  <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
    <div className="md:col-span-6">
                  <div className="text-sm font-bold mb-1">{reofferLabel}</div>
                  <input
                    value={sellerPrice}
                    onChange={(e) => setSellerPrice(e.target.value)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                    placeholder={settlement === "percent" ? "e.g. 97.50" : "e.g. 100.00"}
                  />
                </div>

                <div className="md:col-span-6">
                  <div className="text-sm font-bold mb-1">{clientPriceLabel}</div>
                  <input
                    value={buyerPrice}
                    onChange={(e) => setBuyerPrice(e.target.value)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                    placeholder={settlement === "percent" ? "e.g. 98.00" : "e.g. 100.50"}
                  />
                </div>

                <div className="md:col-span-4">
                  <div className="text-sm font-bold mb-1">{retroClientLabel}</div>
                  <input
                    value={retroClientInput}
                    onChange={(e) => setRetroClientInput(e.target.value)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                    placeholder={settlement === "percent" ? "e.g. 0.50" : `e.g. 1.25 ${currency}/unit`}
                  />
                </div>

                <div className="md:col-span-4">
                  <div className="text-sm font-bold mb-1">{retroIntroducerLabel}</div>
                  <input
                    value={retroIntroducerInput}
                    onChange={(e) => setRetroIntroducerInput(e.target.value)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                    placeholder={settlement === "percent" ? "e.g. 0.25" : `e.g. 0.75 ${currency}/unit`}
                  />
                </div>

                <div className="md:col-span-4">
                  <div className="text-sm font-bold mb-1">{custodianFeeLabel}</div>
                  <input
                    value={feeCustodianInput}
                    onChange={(e) => setFeeCustodianInput(e.target.value)}
                    className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                    placeholder={settlement === "percent" ? "e.g. 0.10" : `e.g. 0.25 ${currency}/unit`}
                  />
                </div>
              </div>
            </Section>

            {/* Legs */}
            <Section title="Legs">
              <div className="space-y-3">
                <datalist id="cp_list">
                  {counterparties.map((cp) => (
                    <option key={cp.id} value={cp.legal_name}>
                      [{cp.cp_type}] {cp.legal_name}
                    </option>
                  ))}
                </datalist>

                {legs.map((l) => (
                  <div key={l.id} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                    <div className="md:col-span-2">
                      <div className="text-sm font-bold mb-1">Leg</div>
                      <select
                        value={l.side}
                        onChange={(e) => setLegField(l.id, { side: e.target.value as any })}
                        className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                      >
                        <option value="buy">Seller</option>
                        <option value="sell">Buyer</option>
                      </select>
                    </div>

                    <div className="md:col-span-6">
                      <div className="text-sm font-bold mb-1">Counterparty</div>
                      <input
                        list="cp_list"
                        value={l.counterparty_text}
                        onChange={(e) => {
                          const name = e.target.value;
                          const match = counterparties.find(
                            (x) => x.legal_name.toLowerCase() === name.trim().toLowerCase()
                          );
                          setLegField(l.id, { counterparty_text: name, counterparty_id: match ? match.id : "" });
                        }}
                        className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                        placeholder="Type to search…"
                      />
                    </div>

                    <div className="md:col-span-3">
                      <div className="text-sm font-bold mb-1">Size</div>
                      <input
                        value={l.size}
                        onChange={(e) => setLegField(l.id, { size: e.target.value })}
                        onBlur={() =>
                          setLegField(l.id, { size: formatSwissFromString(l.size, settlement === "percent" ? 2 : 0) })
                        }
                        className="w-full rounded-xl border border-black/20 px-3 py-2 text-sm font-bold bg-white"
                        placeholder="Size"
                      />
                    </div>

                    <div className="md:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeLeg(l.id)}
                        className="rounded-xl border border-red-500/30 text-red-700 px-3 py-2 text-sm font-bold hover:bg-red-50"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => addLeg("buy")}
                    className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold hover:bg-black/5 bg-white"
                  >
                    + Seller leg
                  </button>
                  <button
                    type="button"
                    onClick={() => addLeg("sell")}
                    className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold hover:bg-black/5 bg-white"
                  >
                    + Buyer leg
                  </button>
                </div>
              </div>
            </Section>

            {/* Footer */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={onCancel}
                className="rounded-xl border border-black/20 px-5 py-2 text-sm font-bold hover:bg-black/5 bg-white"
              >
                Cancel
              </button>

              <div className="flex items-center gap-4 flex-wrap justify-end">
                <div className="text-sm font-bold text-black/50">
                  {retroClientAmtLabel} {`${formatSwiss2(retroClientAmt)} ${currency}`}
                </div>

  {introducerName.trim() ? (
    <div className="text-sm font-bold text-black/50">
      Retro Introducer: {`${formatSwiss2(retroIntroducerAmt)} ${currency}`}
    </div>
  ) : null}

                <div className="text-sm font-bold text-black/70">
                  P&amp;L (CCY): {pnlTradeCcy == null ? "-" : `${formatSwiss2(pnlTradeCcy)} ${currency}`}
                </div>

                <button
                  onClick={save}
                  disabled={!canSave || saving}
                  className={`rounded-xl px-5 py-2 text-sm font-bold text-white ${
                    !canSave || saving ? "bg-black/30" : "bg-[hsl(var(--primary))] hover:opacity-95"
                  }`}
                >
                  {saving ? "Saving…" : saveLabel}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );

  // Final render with stable wrapper (no remounting)
  if (variant === "modal") {
    return (
      <div className="fixed inset-0 z-[10000]">
        <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
        <div className="absolute left-1/2 top-6 -translate-x-1/2 w-[min(1100px,95vw)] max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-black/10">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="rounded-2xl bg-white shadow-sm border border-black/10 overflow-hidden">{content}</div>
    </div>
  );
}