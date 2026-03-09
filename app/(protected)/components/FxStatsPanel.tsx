"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";

type FxRate = {
  quote_ccy: string;
  rate: number;
};

function isoTodayLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function minutesSinceMidnightLocal() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export default function FxStatusPanel() {
  const [rates, setRates] = useState<FxRate[]>([]);
  const [latestDate, setLatestDate] = useState<string | null>(null);
  const [pending, setPending] = useState<number>(0);

  const [pairsExpected, setPairsExpected] = useState<number>(9);
  const [pairsActual, setPairsActual] = useState<number>(0);
  const [missingPairs, setMissingPairs] = useState<string[]>([]);
  const [offdateTrades, setOffdateTrades] = useState<number>(0);

  // Optional small status line so you know self-heal ran (kept subtle)
  const [refreshNote, setRefreshNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadHealth = async () => {
      const { data, error } = await supabase.rpc("get_fx_health");
      if (error || !data?.length) return null;
      return data[0];
    };

    const applyRow = (row: any) => {
      setLatestDate(row.latest_rate_date);
      setPending(row.pending_trades ?? 0);

      setPairsExpected(row.pairs_expected ?? 9);
      setPairsActual(row.pairs_actual ?? 0);
      setMissingPairs(row.missing_pairs ?? []);
      setOffdateTrades(row.offdate_trades ?? 0);

      setRates(row.rates || []);
    };

    const maybeSelfHeal = async (row: any) => {
      const today = isoTodayLocal();

      // Only attempt after ECB fix should be available.
      // You schedule at 16:05 CET; ECB fix is typically available earlier.
      const AFTER_MINUTES = 16 * 60 + 10; // 16:10 local time
      const nowMin = minutesSinceMidnightLocal();

      const latest = row?.latest_rate_date as string | null;
      if (!latest) return false;

      // If FX already up-to-date for today, nothing to do
      if (latest >= today) return false;

      // If it's too early in the day, don't try
      if (nowMin < AFTER_MINUTES) return false;

      // Run at most once per browser session per day
      const guardKey = `fx_selfheal_${today}`;
      if (sessionStorage.getItem(guardKey) === "1") return false;
      sessionStorage.setItem(guardKey, "1");

      // Call edge function using the current user's session token
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return false;

      const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!projectUrl) return false;

      // Supabase edge functions URL: https://<project-ref>.functions.supabase.co/<fn>
      // We derive <project-ref> from NEXT_PUBLIC_SUPABASE_URL (https://<ref>.supabase.co)
      const m = projectUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
      const ref = m?.[1];
      if (!ref) return false;

      setRefreshNote("Refreshing FX…");

      try {
        const resp = await fetch(`https://${ref}.functions.supabase.co/fx-refresh-ecb`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!resp.ok) {
          setRefreshNote(`FX refresh failed (${resp.status})`);
          return false;
        }

        setRefreshNote("FX refreshed.");
        return true;
      } catch {
        setRefreshNote("FX refresh failed.");
        return false;
      }
    };

    const run = async () => {
      // 1) Load health
      const row1 = await loadHealth();
      if (cancelled || !row1) return;

      applyRow(row1);

      // 2) If stale, self-heal
      const healed = await maybeSelfHeal(row1);
      if (cancelled) return;

      // 3) Reload health after healing
      if (healed) {
        const row2 = await loadHealth();
        if (cancelled || !row2) return;
        applyRow(row2);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!latestDate) return null;

  const pairsOk = pairsActual === pairsExpected;

  return (
    <div className="mt-4 rounded-xl bg-white/10 p-3 text-[11px] leading-relaxed">
      <div className="font-semibold mb-2 text-white text-xs">FX Status</div>

      <div className="text-white/70 mb-2">ECB Fix: {latestDate}</div>

      <div className={pairsOk ? "text-white/80 mb-2" : "text-amber-300 mb-2"}>
        Pairs: {pairsActual}/{pairsExpected}
        {!pairsOk && missingPairs.length > 0 ? ` (missing: ${missingPairs.join(", ")})` : ""}
      </div>

      {offdateTrades > 0 && (
        <div className="text-amber-300 mb-2">FX date mismatch trades: {offdateTrades}</div>
      )}

      {pending > 0 && <div className="text-amber-300 mb-3">Pending trades: {pending}</div>}

      {refreshNote && <div className="text-white/60 mb-2">{refreshNote}</div>}

      <div className="space-y-2">
        {rates.map((r) => (
          <div
            key={r.quote_ccy}
            className="flex justify-between text-white/85 border-b border-white/10 pb-1"
          >
            <span>EUR{r.quote_ccy}</span>
            <span>{Number(r.rate).toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
