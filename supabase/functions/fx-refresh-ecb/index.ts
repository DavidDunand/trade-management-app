import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CURRENCIES = ["USD", "CHF", "GBP", "AUD", "JPY", "SEK", "NOK", "CAD", "HKD"];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 3, baseDelayMs = 1500) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch ECB rates: ${response.status}`);
      }

      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < retries) {
        await sleep(baseDelayMs * attempt);
      }
    }
  }

  throw lastError ?? new Error("Unknown fetch error");
}

serve(async (req) => {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let startDate: string | null = null;
    let endDate: string | null = null;

    if (req.method === "POST") {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const body = await req.json().catch(() => ({}));
        startDate = body?.start_date ?? null;
        endDate = body?.end_date ?? null;
      }
    }

    let url: string;

    if (startDate && endDate) {
      if (startDate === endDate) {
        // single-day fetch
        url = `https://api.frankfurter.app/${startDate}?from=EUR&to=${CURRENCIES.join(",")}`;
      } else {
        // range fetch
        url = `https://api.frankfurter.app/${startDate}..${endDate}?from=EUR&to=${CURRENCIES.join(",")}`;
      }
    } else {
      // latest fetch
      url = `https://api.frankfurter.app/latest?from=EUR&to=${CURRENCIES.join(",")}`;
    }

    const response = await fetchWithRetry(url, 3, 1500);
    const data = await response.json();

    // Range response: { amount, base, start_date, end_date, rates: { "YYYY-MM-DD": { USD:..., ... } } }
    // Single/latest response: { amount, base, date, rates: { USD:..., ... } }
    const isRange = !!startDate && !!endDate && startDate !== endDate;

    if (isRange) {
      const ratesByDate = data.rates as Record<string, Record<string, number>>;

      for (const [rateDate, dayRates] of Object.entries(ratesByDate)) {
        for (const ccy of CURRENCIES) {
          const rate = dayRates?.[ccy];
          if (rate == null) continue;

          const { error } = await supabase.from("fx_rates").upsert({
            rate_date: rateDate,
            quote_ccy: ccy,
            rate,
            source: "ECB",
            retrieved_at: new Date().toISOString(),
          });

          if (error) throw error;
        }
      }

      return new Response(
        JSON.stringify({ success: true, mode: "range", startDate, endDate }),
        { status: 200 }
      );
    }

    // Single-day OR latest mode
    const rateDate = data.date as string;
    const rates = data.rates as Record<string, number>;

    for (const ccy of CURRENCIES) {
      const rate = rates[ccy];
      if (rate == null) continue;

      const { error } = await supabase.from("fx_rates").upsert({
        rate_date: rateDate,
        quote_ccy: ccy,
        rate,
        source: "ECB",
        retrieved_at: new Date().toISOString(),
      });

      if (error) throw error;
    }

    // Re-sync ALL trades for "today" that are not stamped with today's fix yet.
    const today = rateDate;

    const { data: tradesToCheck, error: tradesErr } = await supabase
      .from("trades")
      .select(`
        id,
        trade_date,
        fx_rate_date,
        fx_eur_rate,
        product:product_id(currency)
      `)
      .eq("trade_date", today);

    if (tradesErr) throw tradesErr;

    for (const t of tradesToCheck || []) {
      const ccy = (t as any)?.product?.currency?.toUpperCase?.().trim?.();
      if (!ccy || ccy === "EUR") continue;

      const needsUpdate =
        (t as any).fx_eur_rate == null ||
        ((t as any).fx_rate_date ?? null) !== today;

      if (!needsUpdate) continue;

      const rate = rates[ccy];
      if (rate == null) continue;

      const { error: upErr } = await supabase
        .from("trades")
        .update({
          fx_eur_rate: rate,
          fx_rate_date: today,
          fx_pending: false,
          fx_source: "ECB",
          fx_updated_at: new Date().toISOString(),
        })
        .eq("id", (t as any).id);

      if (upErr) throw upErr;
    }

    return new Response(
      JSON.stringify({
        success: true,
        mode: startDate && endDate && startDate === endDate ? "single-day" : "latest",
        rateDate,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500 }
    );
  }
});