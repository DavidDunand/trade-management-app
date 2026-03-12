"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { supabase } from "@/src/lib/supabase";
import type { TradeLeg, ValidationCheck, CheckLevel } from "../../types";

interface Props {
  leg: TradeLeg;
  onBack: () => void;
  onNext: () => void;
}

function CheckRow({ check }: { check: ValidationCheck }) {
  const iconMap: Record<CheckLevel, React.ReactNode> = {
    ok: <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />,
    error: <XCircle className="h-4 w-4 text-red-500 shrink-0" />,
  };

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      {iconMap[check.level]}
      <div className="flex-1 min-w-0">
        <p
          className={[
            "text-sm font-medium",
            check.level === "error"
              ? "text-red-700"
              : check.level === "warning"
              ? "text-amber-700"
              : "text-gray-800",
          ].join(" ")}
        >
          {check.label}
        </p>
        {check.detail && (
          <p className="text-xs text-gray-500 mt-0.5">{check.detail}</p>
        )}
        {check.actionLabel && check.actionHref && (
          <a
            href={check.actionHref}
            className="text-xs text-teal-600 hover:underline mt-0.5 inline-block"
          >
            {check.actionLabel} →
          </a>
        )}
      </div>
    </div>
  );
}

export default function Step3Validation({ leg, onBack, onNext }: Props) {
  const [checks, setChecks] = useState<ValidationCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    runChecks();
  }, [leg.clientId]);

  async function runChecks() {
    setLoading(true);
    const results: ValidationCheck[] = [];

    // 1. Fetch client contacts
    let contacts: { id: string; email: string | null }[] = [];
    if (leg.clientId) {
      const { data } = await supabase
        .from("advisor_contacts")
        .select("id, email")
        .eq("advisor_id", leg.clientId);
      contacts = (data ?? []) as { id: string; email: string | null }[];
    }

    const hasContactWithEmail = contacts.some((c) => c.email && c.email.trim());
    results.push({
      label: "Client has at least one contact with an email address",
      level: hasContactWithEmail ? "ok" : "error",
      detail: hasContactWithEmail ? undefined : "No contact with an email found for this client.",
      actionLabel: hasContactWithEmail ? undefined : "Add contact",
      actionHref: hasContactWithEmail ? undefined : "/advisors",
    });

    // 2. Client name is not empty
    const clientName = leg.counterpartyLegalName?.trim();
    results.push({
      label: "Client legal name is set",
      level: clientName && clientName !== "-" ? "ok" : "error",
      detail: clientName && clientName !== "-" ? undefined : "Counterparty legal name is missing.",
    });

    // 3. Dealer SSI
    const dealerSsiSet =
      leg.distributingEntity === "Valeur Securities AG, Switzerland"
        ? true // hardcoded, always present
        : !!(leg.dealerSSI?.trim());
    results.push({
      label: "Dealer settlement instructions (SSI) are set",
      level: dealerSsiSet ? "ok" : "warning",
      detail: dealerSsiSet ? undefined : "Dealer SSI is missing. It will appear blank on the ticket.",
    });

    // 4. Counterparty SSI
    const cpSsiSet = !!(leg.counterpartySSI?.trim());
    results.push({
      label: "Counterparty settlement instructions (SSI) are set",
      level: cpSsiSet ? "ok" : "warning",
      detail: cpSsiSet ? undefined : "Counterparty SSI is missing. It will appear blank on the ticket.",
    });

    setChecks(results);
    setLoading(false);
  }

  const hasErrors = checks.some((c) => c.level === "error");
  const hasWarnings = checks.some((c) => c.level === "warning");
  const canProceed = !hasErrors && (!hasWarnings || acknowledged);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Validation</h2>
        <p className="text-sm text-gray-500 mt-0.5">Pre-flight checks before generating the ticket</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Running checks…</span>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          {checks.map((c, i) => (
            <div key={i} className="px-4">
              <CheckRow check={c} />
            </div>
          ))}
        </div>
      )}

      {!loading && hasWarnings && !hasErrors && (
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-teal-500 accent-teal-500"
          />
          <span className="text-sm text-gray-700">
            I acknowledge the warnings above and wish to proceed anyway
          </span>
        </label>
      )}

      {!loading && hasErrors && (
        <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          Resolve all errors above before proceeding.
        </p>
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
          onClick={onNext}
          disabled={!canProceed || loading}
          className="flex-1 rounded-lg bg-teal-500 py-2.5 text-sm font-semibold text-white hover:bg-teal-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
