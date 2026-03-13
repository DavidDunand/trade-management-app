"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";
import FxStatusPanel from "./components/FxStatsPanel";

// Icons (lucide-react)
import {
  LayoutDashboard,
  ScrollText,
  PlusCircle,
  FileText,
  FileSpreadsheet,
  Package,
  Building2,
  Users,
  Handshake,
  BriefcaseBusiness,
  ChevronRight,
} from "lucide-react";

type Profile = {
  id: string;
  email: string | null;
  full_name: string;
  role: "admin" | "readonly";
  active: boolean;
};

type NavItemDef = {
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  disabled?: boolean;
};

function NavSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pt-5 pb-2">
      <div className="text-[11px] font-semibold tracking-[0.14em] text-white/55 uppercase">
        {children}
      </div>
    </div>
  );
}

function NavItem({ item }: { item: NavItemDef }) {
  const pathname = usePathname();
  const active = pathname === item.href;
  const Icon = item.icon;

  const base =
    "group relative flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] leading-5 transition-colors";

  if (item.disabled) {
    return (
      <div className={`${base} text-white/45 cursor-not-allowed`}>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5">
          <Icon className="h-4 w-4 opacity-80" />
        </span>
        <span className="truncate">{item.label}</span>
        <span className="ml-auto text-[11px] text-white/35">Soon</span>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={[
        base,
        active
          ? "bg-white/14 text-white shadow-sm"
          : "text-white/80 hover:bg-white/10 hover:text-white",
      ].join(" ")}
    >
      <span
        className={[
          "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
          active ? "bg-white/12" : "bg-white/5 group-hover:bg-white/10",
        ].join(" ")}
      >
        <Icon className="h-4 w-4" />
      </span>

      <span className="truncate">{item.label}</span>

      <ChevronRight
        className={[
          "ml-auto h-4 w-4 opacity-0 transition-opacity",
          active ? "opacity-70" : "group-hover:opacity-40",
        ].join(" ")}
      />
    </Link>
  );
}

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      if (!ignore) setLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        if (!ignore) {
          setProfile(null);
          setLoading(false);
        }
        router.replace("/login");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id,email,full_name,role,active")
        .eq("id", session.user.id)
        .single();

      if (error || !data || !data.active) {
        await supabase.auth.signOut();
        if (!ignore) {
          setProfile(null);
          setLoading(false);
        }
        router.replace("/login");
        return;
      }

      if (!ignore) {
        setProfile(data as Profile);
        setLoading(false);
      }
    };

    load();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      load();
    });

    return () => {
      ignore = true;
      subscription.unsubscribe();
    };
  }, [router]);

  const isAdmin = profile?.role === "admin";

  const tradingItems: NavItemDef[] = useMemo(
    () => [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/blotter", label: "Blotter", icon: ScrollText, adminOnly: true },
      { href: "/new-trade", label: "New Trade", icon: PlusCircle, adminOnly: true },
    ],
    []
  );

  const docItems: NavItemDef[] = useMemo(
    () => [
      { href: "/trade-tickets", label: "Trade Tickets", icon: FileText, adminOnly: true },
      { href: "/transaction-reporting", label: "MiFID 2 Report", icon: FileSpreadsheet, adminOnly: true },
      { href: "/invoicing", label: "Invoicing", icon: FileSpreadsheet, adminOnly: true },
    ],
    []
  );

  const dbItems: NavItemDef[] = useMemo(
    () => [
      { href: "/products", label: "Products", icon: Package, adminOnly: true },
      { href: "/issuers", label: "Issuers", icon: Building2, adminOnly: true },
      { href: "/counterparties", label: "Counterparties", icon: Handshake, adminOnly: true },
      { href: "/advisors", label: "Clients", icon: Users, adminOnly: true },
      { href: "/sales", label: "Sales", icon: BriefcaseBusiness, adminOnly: true },
      { href: "/group-entities", label: "Group Entities", icon: Building2, adminOnly: true },
    ],
    []
  );

  const visible = (items: NavItemDef[]) =>
    items.filter((i) => (i.adminOnly ? isAdmin : true));

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 text-white flex flex-col bg-[hsl(var(--primary))]">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="text-[15px] font-semibold tracking-tight">Valeur Europe</div>
          <div className="text-[11px] text-white/70 mt-1">
            {profile.full_name} • {profile.role}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <nav className="px-3 pb-3">
            <NavSectionTitle>Trading</NavSectionTitle>
            <div className="space-y-1">
              {visible(tradingItems).map((item) => (
                <NavItem key={item.href} item={item} />
              ))}
            </div>

            <NavSectionTitle>Documentation</NavSectionTitle>
            <div className="space-y-1">
              {visible(docItems).map((item) => (
                <NavItem key={item.href} item={item} />
              ))}
            </div>

            <NavSectionTitle>Database</NavSectionTitle>
            <div className="space-y-1">
              {visible(dbItems).map((item) => (
                <NavItem key={item.href} item={item} />
              ))}
            </div>

            <div className="h-5" />

            <div className="px-1 pb-3">
              <FxStatusPanel />
            </div>

            <div className="pb-3">
              <button
                onClick={signOut}
                className="w-full rounded-xl bg-white text-[hsl(var(--primary))] py-2 text-[13px] font-medium hover:opacity-95"
              >
                Sign out
              </button>
            </div>
          </nav>
        </div>
      </aside>

      <main className="flex-1 p-8 bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-950">
        {children}
      </main>
    </div>
  );
}