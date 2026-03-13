"use client";

import { useEffect, useState } from "react";
import { Loader2, User } from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import type { TradeLeg, ClientContact } from "../../types";

interface Props {
  leg: TradeLeg;
  initialContact: ClientContact | null;
  initialCustodianContact?: ClientContact | null;
  onBack: () => void;
  onNext: (contact: ClientContact, custodianContact: ClientContact | null) => void;
}

export default function Step4Contact({ leg, initialContact, initialCustodianContact, onBack, onNext }: Props) {
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [selectedId, setSelectedId] = useState<string>(initialContact?.id ?? "");
  const [loading, setLoading] = useState(true);

  // Custodian contacts
  const [cpContacts, setCpContacts] = useState<ClientContact[]>([]);
  const [selectedCpId, setSelectedCpId] = useState<string>(initialCustodianContact?.id ?? "");
  const [cpLoading, setCpLoading] = useState(false);

  useEffect(() => {
    fetchContacts();
  }, [leg.clientId]);

  useEffect(() => {
    if (leg.counterpartyId) fetchCpContacts();
  }, [leg.counterpartyId]);

  async function fetchContacts() {
    setLoading(true);
    if (!leg.clientId) {
      setContacts([]);
      setLoading(false);
      return;
    }

    const { data, error: fetchErr } = await supabase
      .from("advisor_contacts")
      .select("id, first_name, family_name, email, is_primary")
      .eq("advisor_id", leg.clientId)
      .order("first_name");

    let rows: {
      id: string;
      first_name: string;
      family_name: string;
      email: string | null;
      is_primary?: boolean | null;
    }[];

    if (fetchErr) {
      const { data: fallback } = await supabase
        .from("advisor_contacts")
        .select("id, first_name, family_name, email")
        .eq("advisor_id", leg.clientId)
        .order("first_name");
      rows = (fallback ?? []) as typeof rows;
    } else {
      rows = (data ?? []) as typeof rows;
    }

    const mapped: ClientContact[] = rows.map((r, i) => ({
      id: r.id,
      name: `${r.first_name ?? ""} ${r.family_name ?? ""}`.trim(),
      email: r.email ?? "",
      isPrimary: r.is_primary ?? i === 0,
    }));

    setContacts(mapped);

    if (!selectedId && mapped.length > 0) {
      const primary = mapped.find((c) => c.isPrimary) ?? mapped[0];
      setSelectedId(primary.id);
    }

    setLoading(false);
  }

  async function fetchCpContacts() {
    if (!leg.counterpartyId) return;
    setCpLoading(true);
    const { data } = await supabase
      .from("counterparty_contacts")
      .select("id, first_name, family_name, email")
      .eq("counterparty_id", leg.counterpartyId)
      .order("first_name");

    const rows = (data ?? []) as { id: string; first_name: string; family_name: string; email: string | null }[];
    const mapped: ClientContact[] = rows.map((r) => ({
      id: r.id,
      name: `${r.first_name ?? ""} ${r.family_name ?? ""}`.trim(),
      email: r.email ?? "",
      isPrimary: false,
    }));
    setCpContacts(mapped);

    // Auto-select first custodian contact with email if none pre-selected
    if (!selectedCpId && mapped.length > 0) {
      const withEmail = mapped.find((c) => c.email);
      if (withEmail) setSelectedCpId(withEmail.id);
    }

    setCpLoading(false);
  }

  function handleNext() {
    const contact = contacts.find((c) => c.id === selectedId);
    if (!contact) return;
    const custodianContact = cpContacts.find((c) => c.id === selectedCpId) ?? null;
    onNext(contact, custodianContact);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading contacts…</span>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-800">Select Contact</h2>
        </div>
        <div className="flex flex-col items-center gap-2 py-12 text-gray-400">
          <User className="h-8 w-8" />
          <p className="text-sm">No contacts found for this client</p>
          <a href="/advisors" className="text-xs text-teal-600 hover:underline mt-1">
            Add a contact →
          </a>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="w-full rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Select Contact</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Choose the recipient for this trade ticket
        </p>
      </div>

      {/* Client contacts */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Client Contact</p>
        <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
          {contacts.map((c) => (
            <label
              key={c.id}
              className={[
                "flex items-center gap-3 px-4 py-3 cursor-pointer transition",
                selectedId === c.id ? "bg-teal-50" : "hover:bg-gray-50",
              ].join(" ")}
            >
              <input
                type="radio"
                name="contact"
                value={c.id}
                checked={selectedId === c.id}
                onChange={() => setSelectedId(c.id)}
                className="accent-teal-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-800">{c.name}</span>
                  {c.isPrimary && (
                    <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-semibold">
                      Primary
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{c.email || "No email"}</span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Custodian contacts */}
      {leg.counterpartyId && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Custodian Contact
            <span className="ml-1 normal-case font-normal text-gray-400">(optional — shown in settlement instructions)</span>
          </p>
          {cpLoading ? (
            <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading custodian contacts…
            </div>
          ) : cpContacts.length === 0 ? (
            <div className="rounded-xl border border-gray-200 px-4 py-4 text-sm text-gray-400">
              No contacts found for this custodian.{" "}
              <a href="/counterparties" className="text-teal-600 hover:underline">Add one →</a>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
              {/* "None" option */}
              <label
                className={[
                  "flex items-center gap-3 px-4 py-3 cursor-pointer transition",
                  selectedCpId === "" ? "bg-gray-50" : "hover:bg-gray-50",
                ].join(" ")}
              >
                <input
                  type="radio"
                  name="cpContact"
                  value=""
                  checked={selectedCpId === ""}
                  onChange={() => setSelectedCpId("")}
                  className="accent-teal-500"
                />
                <span className="text-sm text-gray-400 italic">None — leave contact blank on ticket</span>
              </label>
              {cpContacts.map((c) => (
                <label
                  key={c.id}
                  className={[
                    "flex items-center gap-3 px-4 py-3 cursor-pointer transition",
                    selectedCpId === c.id ? "bg-teal-50" : "hover:bg-gray-50",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="cpContact"
                    value={c.id}
                    checked={selectedCpId === c.id}
                    onChange={() => setSelectedCpId(c.id)}
                    className="accent-teal-500"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-800">{c.name}</span>
                    <div className="text-xs text-gray-500">{c.email || "No email"}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

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
          onClick={handleNext}
          disabled={!selectedId}
          className="flex-1 rounded-lg bg-teal-500 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
