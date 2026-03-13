"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md border border-black/10 rounded-2xl overflow-hidden shadow-sm">
        <div className="bg-[#002651] px-6 py-8 flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/valeur-logo.svg" alt="Valeur Paris" className="h-28 w-auto brightness-0 invert" />
          <p className="text-white/70 text-sm tracking-wide">Sign in to continue</p>
        </div>

        <form onSubmit={signIn} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-black mb-1">Email</label>
            <input
              className="w-full rounded-xl border border-black/20 px-4 py-2 outline-none focus:ring-2 focus:ring-[#002651]/30"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">Password</label>
            <input
              className="w-full rounded-xl border border-black/20 px-4 py-2 outline-none focus:ring-2 focus:ring-[#002651]/30"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#002651] text-white py-2.5 font-medium hover:opacity-95 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <div className="text-xs text-black/60">
            Access is controlled by admin. If you can’t log in, ask for your account to be activated.
          </div>
        </form>
      </div>
    </div>
  );
}
