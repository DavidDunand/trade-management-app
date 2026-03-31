"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";

type Health = {
  overdue: number;
  pending: number;
  validationIssues: number;
  armPending: number;
  armTotal: number;
};

function isOverdue(tradeDate: string) {
  const today = new Date();
  const td = new Date(tradeDate);
  const diff = Math.floor((today.getTime() - td.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 2;
}

export default function MifidNavBadge() {
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: trades } = await supabase
        .from("trades")
        .select("id, trade_date, booking_timestamp, product:products(isin, maturity_date)")
        .eq("reportable", true);

      if (cancelled || !trades?.length) return;

      const tradeIds = trades.map((t: any) => t.id);

      const [{ data: links }, { data: legs }] = await Promise.all([
        supabase.from("mifid_report_trades").select("trade_id, arm_status").in("trade_id", tradeIds),
        supabase.from("trade_legs").select("trade_id, counterparty:counterparty_id(lei)").in("trade_id", tradeIds),
      ]);

      if (cancelled) return;

      const reportMap = new Map<string, string>(); // trade_id -> arm_status
      (links ?? []).forEach((l: any) => reportMap.set(l.trade_id, l.arm_status));

      // Build a per-trade LEI validity map: false if any leg is missing LEI
      const leiOk = new Map<string, boolean>();
      (legs ?? []).forEach((l: any) => {
        if (!leiOk.has(l.trade_id)) leiOk.set(l.trade_id, true);
        if (!l.counterparty?.lei) leiOk.set(l.trade_id, false);
      });

      let overdue = 0, pending = 0, validationIssues = 0, armPending = 0, armTotal = 0;

      for (const t of trades as any[]) {
        const product = Array.isArray(t.product) ? t.product[0] : t.product;
        const hasReport = reportMap.has(t.id);

        if (!product?.isin) validationIssues++;
        if (!product?.maturity_date) validationIssues++;
        if (!t.booking_timestamp) validationIssues++;
        if (leiOk.get(t.id) === false) validationIssues++;

        if (!hasReport) {
          pending++;
          if (isOverdue(t.trade_date)) overdue++;
        } else {
          armTotal++;
          if (reportMap.get(t.id) === "pending") armPending++;
        }
      }

      if (!cancelled) setHealth({ overdue, pending, validationIssues, armPending, armTotal });
    })();

    return () => { cancelled = true; };
  }, []);

  if (!health) return null;

  const hasPending    = health.pending > 0;
  const hasOverdue    = health.overdue > 0;
  const hasValidation = health.validationIssues > 0;
  const hasArmGap     = health.armTotal > 0 && health.armPending > 0;

  if (!hasPending && !hasOverdue && !hasValidation && !hasArmGap) return null;

  return (
    <span className="ml-auto flex items-center gap-0.5 shrink-0">
      {/* Overdue — red; or pending — amber */}
      {hasOverdue && (
        <span className="inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
          {health.overdue}
        </span>
      )}
      {!hasOverdue && hasPending && (
        <span className="inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-amber-400 text-white text-[10px] font-bold leading-none">
          {health.pending}
        </span>
      )}

      {/* Validation issues — orange */}
      {hasValidation && (
        <span className="inline-flex items-center justify-center min-w-[17px] h-[17px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold leading-none">
          {health.validationIssues}
        </span>
      )}

      {/* ARM feedback — yellow, shows confirmed/total */}
      {hasArmGap && (
        <span className="inline-flex items-center justify-center h-[17px] px-1.5 rounded-full bg-yellow-300 text-yellow-900 text-[10px] font-bold leading-none whitespace-nowrap">
          {health.armTotal - health.armPending}/{health.armTotal}
        </span>
      )}
    </span>
  );
}
