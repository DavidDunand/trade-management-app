"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type Issuer = {
  id: string;
  legal_name: string;
  country_code: string;
};

type SortKey = "legal_name" | "country_code" | null;
type SortDir = "asc" | "desc";

export default function IssuersPage() {
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");

  // edit state (cosmetic UI only, updates same issuers table)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftCountry, setDraftCountry] = useState("");

  // sorting (client-side)
  const [sortKey, setSortKey] = useState<SortKey>("legal_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchIssuers = async () => {
    const { data, error } = await supabase
      .from("issuers")
      .select("id, legal_name, country_code")
      .order("legal_name");

    if (!error && data) setIssuers(data as Issuer[]);
  };

  const addIssuer = async () => {
    if (!name || !country) return;

    const { error } = await supabase.from("issuers").insert([
      {
        legal_name: name,
        country_code: country,
      },
    ]);

    if (error) {
      alert(error.message);
      return;
    }

    setName("");
    setCountry("");
    fetchIssuers();
  };

  const deleteIssuer = async (id: string) => {
    const ok = confirm(
      "Delete this issuer? This will fail if it is referenced by a product."
    );
    if (!ok) return;

    const { error } = await supabase.from("issuers").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    // keep edit state consistent if you deleted the one being edited
    if (editingId === id) {
      setEditingId(null);
      setDraftName("");
      setDraftCountry("");
    }

    fetchIssuers();
  };

  const startEdit = (issuer: Issuer) => {
    setEditingId(issuer.id);
    setDraftName(issuer.legal_name ?? "");
    setDraftCountry(issuer.country_code ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftName("");
    setDraftCountry("");
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const legal_name = draftName.trim();
    const country_code = draftCountry.trim();

    if (!legal_name) {
      alert("Legal Name is required.");
      return;
    }
    if (!country_code) {
      alert("Country is required.");
      return;
    }

    const { error } = await supabase
      .from("issuers")
      .update({ legal_name, country_code })
      .eq("id", editingId);

    if (error) {
      alert(error.message);
      return;
    }

    setEditingId(null);
    setDraftName("");
    setDraftCountry("");
    fetchIssuers();
  };

  const toggleSort = (key: Exclude<SortKey, null>) => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDir("asc");
        return key;
      }
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return prev;
    });
  };

  const SortIcon = ({ k }: { k: Exclude<SortKey, null> }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-4 w-4 opacity-60" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-4 w-4" />
    ) : (
      <ArrowDown className="h-4 w-4" />
    );
  };

  const sortedIssuers = useMemo(() => {
    if (!sortKey) return issuers;
    const dirMul = sortDir === "asc" ? 1 : -1;

    const getVal = (i: Issuer) => {
      if (sortKey === "legal_name") return (i.legal_name ?? "").toLowerCase();
      if (sortKey === "country_code") return (i.country_code ?? "").toLowerCase();
      return "";
    };

    return [...issuers].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (av < bv) return -1 * dirMul;
      if (av > bv) return 1 * dirMul;
      return 0;
    });
  }, [issuers, sortKey, sortDir]);

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 bg-white hover:bg-black/5 active:scale-[0.98] transition";

  useEffect(() => {
    fetchIssuers();
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-black">Issuers</h1>

      <div className="rounded-2xl border border-black/10 p-5 space-y-4">
        <div className="flex gap-4">
          <input
            placeholder="Legal Name (e.g. BNP Paribas SA, France)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-xl border border-black/20 px-4 py-2"
          />
          <input
            placeholder="Country Code (FR)"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-32 rounded-xl border border-black/20 px-4 py-2"
          />
          <button
            onClick={addIssuer}
            className="bg-[#002651] text-white px-4 rounded-xl"
          >
            Add
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-black/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left">
            <tr>
              <th className="p-3">
                <button
                  type="button"
                  onClick={() => toggleSort("legal_name")}
                  className="inline-flex items-center gap-2 font-semibold text-black/80 hover:text-black"
                  title="Sort by Legal Name"
                >
                  Legal Name <SortIcon k="legal_name" />
                </button>
              </th>
              <th className="p-3">
                <button
                  type="button"
                  onClick={() => toggleSort("country_code")}
                  className="inline-flex items-center gap-2 font-semibold text-black/80 hover:text-black"
                  title="Sort by Country"
                >
                  Country <SortIcon k="country_code" />
                </button>
              </th>
              <th className="p-3 w-32">Actions</th>
            </tr>
          </thead>

          <tbody>
            {sortedIssuers.map((issuer) => {
              const isEditing = editingId === issuer.id;

              return (
                <tr key={issuer.id} className="border-t border-black/10">
<td className="p-3">
  {isEditing ? (
    <input
      value={draftName}
      onChange={(e) => setDraftName(e.target.value)}
      className="w-full rounded-lg border border-black/20 px-2 py-1"
    />
  ) : (
    <span className="font-semibold text-black">
      {issuer.legal_name}
    </span>
  )}
</td>

                  <td className="p-3">
                    {isEditing ? (
                      <input
                        value={draftCountry}
                        onChange={(e) => setDraftCountry(e.target.value)}
                        className="w-28 rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : (
                      issuer.country_code
                    )}
                  </td>

                  <td className="p-3">
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button
                          onClick={saveEdit}
                          className="rounded-lg bg-[#002651] text-white px-3 py-1 hover:opacity-95"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded-lg border border-black/20 px-3 py-1 hover:bg-black/5"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(issuer)}
                          className={iconBtn}
                          title="Edit"
                          aria-label="Edit issuer"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteIssuer(issuer.id)}
                          className={iconBtn + " hover:bg-red-50"}
                          title="Delete"
                          aria-label="Delete issuer"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {sortedIssuers.length === 0 && (
              <tr>
                <td className="p-4 text-black/60" colSpan={3}>
                  No issuers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}