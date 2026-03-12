"use client";

import { useEffect, useState } from "react";
import { Loader2, User } from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import type { TradeLeg, ClientContact } from "../../types";

interface Props {
  leg: TradeLeg;
  initialContact: ClientContact | null;
  onBack: () => void;
  onNext: (contact: ClientContact) => void;
}

export default function Step4Contact({ leg, initialContact, onBack, onNext }: Props) {
  const [contacts, setContacts] = useState<ClientContact[]>([]);
  const [selectedId, setSelectedId] = useState<string>(initialContact?.id ?? "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchContacts();
  }, [leg.clientId]);

  async function fetchContacts() {
    setLoading(true);
    if (!leg.clientId) {
      setContacts([]);
      setLoading(false);
      return;
    }

    // Fetch contacts; try including is_primary, fall back if column doesn't exist yet
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
      // is_primary may not exist yet (migration pending) — retry without it
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

    // Pre-select primary or first
    if (!selectedId && mapped.length > 0) {
      const primary = mapped.find((c) => c.isPrimary) ?? mapped[0];
      setSelectedId(primary.id);
    }

    setLoading(false);
  }

  function handleNext() {
    const contact = contacts.find((c) => c.id === selectedId);
    if (!contact) return;
    onNext(contact);
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
