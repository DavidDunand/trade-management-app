"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import TradeTicketWizard from "./components/TradeTicketWizard";
import type { AppUser } from "./types";

export default function TradeTicketsPage() {
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", session.user.id)
        .single();
      const d = data as any;
      if (d) setUser({ name: d.full_name ?? "Unknown", email: d.email ?? session.user.email ?? "" });
    });
  }, []);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-64 text-gray-400 text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Trade Tickets</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Search for a trade, review the leg, and generate a PDF, Word, or PNG confirmation
        </p>
      </div>

      <TradeTicketWizard currentUser={user} />
    </div>
  );
}
