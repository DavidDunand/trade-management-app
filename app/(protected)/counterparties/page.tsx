"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

type CpType = "issuer_dealer" | "custodian" | "internal" | "other";

type Counterparty = {
  id: string;
  legal_name: string;
  country_code: string | null;
  lei: string | null;
  ssi: string | null;
  cp_type: CpType;
};

const cpTypeLabel: Record<CpType, string> = {
  issuer_dealer: "Dealer",
  custodian: "Custodian",
  internal: "Internal",
  other: "Other",
};

const labelToCpType: Record<string, CpType> = {
  Dealer: "issuer_dealer",
  Custodian: "custodian",
  Internal: "internal",
  Other: "other",
};

type SortKey = "cp_type" | "legal_name" | "country_code" | null;
type SortDir = "asc" | "desc";

export default function CounterpartiesPage() {
  const [rows, setRows] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");

  // add form
  const [cpType, setCpType] = useState<CpType>("custodian");
  const [legalName, setLegalName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [lei, setLei] = useState("");
  const [ssi, setSsi] = useState("");

  // edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Counterparty>>({});

  // sorting (client-side only)
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("counterparties")
      .select("id, legal_name, country_code, lei, ssi, cp_type")
      .order("legal_name");

    if (error) alert(error.message);
    if (data) setRows(data as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [
        r.legal_name,
        r.country_code,
        r.lei,
        r.ssi,
        cpTypeLabel[r.cp_type],
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

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

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;

    const dirMul = sortDir === "asc" ? 1 : -1;

    const getVal = (r: Counterparty) => {
      if (sortKey === "legal_name") return (r.legal_name ?? "").toLowerCase();
      if (sortKey === "country_code") return (r.country_code ?? "").toLowerCase();
      if (sortKey === "cp_type") return (cpTypeLabel[r.cp_type] ?? "").toLowerCase();
      return "";
    };

    return [...filtered].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (av < bv) return -1 * dirMul;
      if (av > bv) return 1 * dirMul;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const resetAdd = () => {
    setCpType("custodian");
    setLegalName("");
    setCountryCode("");
    setLei("");
    setSsi("");
  };

  const addRow = async () => {
    if (!legalName.trim() || !countryCode.trim()) return;

    const payload = {
      cp_type: cpType,
      legal_name: legalName.trim(),
      country_code: countryCode.trim().toUpperCase(),
      lei: lei.trim() ? lei.trim() : null,
      ssi: ssi.trim() ? ssi.trim() : null,
    };

    const { error } = await supabase.from("counterparties").insert([payload]);
    if (error) return alert(error.message);

    resetAdd();
    fetchRows();
  };

  const startEdit = (r: Counterparty) => {
    setEditingId(r.id);
    setEditDraft({ ...r });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const payload = {
      cp_type: editDraft.cp_type,
      legal_name: (editDraft.legal_name ?? "").trim(),
      country_code: (editDraft.country_code ?? "").trim().toUpperCase() || null,
      lei: (editDraft.lei ?? "").trim() || null,
      ssi: (editDraft.ssi ?? "").trim() || null,
    };

    if (!payload.legal_name) return alert("Legal Name is required.");

    const { error } = await supabase
      .from("counterparties")
      .update(payload)
      .eq("id", editingId);

    if (error) return alert(error.message);

    cancelEdit();
    fetchRows();
  };

  const removeRow = async (id: string) => {
    if (
      !confirm(
        "Delete this counterparty? This will fail if it is referenced by trades (expected)."
      )
    )
      return;

    const { error } = await supabase.from("counterparties").delete().eq("id", id);
    if (error) return alert(error.message);

    // keep edit state consistent
    if (editingId === id) cancelEdit();

    fetchRows();
  };

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 bg-white hover:bg-black/5 active:scale-[0.98] transition";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-black">Counterparties</h1>
          <div className="text-sm text-black/60">
            Dealer / Custodian / Internal / Other
          </div>
        </div>

        <div className="flex items-center gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="rounded-xl border border-black/20 px-4 py-2 text-sm font-bold w-80"
          />
          <button
            onClick={fetchRows}
            className="rounded-xl border border-black/20 px-4 py-2 text-sm font-bold hover:bg-black/5"
          >
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Add */}
      <div className="rounded-2xl border border-black/10 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={cpTypeLabel[cpType]}
            onChange={(e) => setCpType(labelToCpType[e.target.value])}
            className="rounded-xl border border-black/20 px-3 py-2 bg-white text-sm font-bold"
          >
            {Object.values(cpTypeLabel).map((lbl) => (
              <option key={lbl} value={lbl}>
                {lbl}
              </option>
            ))}
          </select>

          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="Legal Name"
            className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold md:col-span-2"
          />

          <input
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            placeholder="Country Code (FR)"
            className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
          />

          <button
            onClick={addRow}
            className="rounded-xl bg-[#002651] text-white px-4 py-2 text-sm font-bold hover:opacity-95"
          >
            Add
          </button>

          <input
            value={lei}
            onChange={(e) => setLei(e.target.value)}
            placeholder="LEI (optional)"
            className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold md:col-span-2"
          />

          <input
            value={ssi}
            onChange={(e) => setSsi(e.target.value)}
            placeholder="SSI (optional)"
            className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold md:col-span-2"
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-black/10 overflow-hidden">
        {/* removed font-bold from whole table */}
        <table className="w-full text-sm">
          {/* header style aligned with Issuers/Products */}
          <thead className="bg-black/5 text-left">
            <tr>
              <th className="p-3">
                <button
                  type="button"
                  onClick={() => toggleSort("cp_type")}
                  className="inline-flex items-center gap-2 font-semibold text-black/80 hover:text-black"
                  title="Sort by Type"
                >
                  Type <SortIcon k="cp_type" />
                </button>
              </th>

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

              <th className="p-3">LEI</th>
              <th className="p-3">SSI</th>
              <th className="p-3 w-32"></th>
            </tr>
          </thead>

          <tbody>
            {sorted.map((r) => {
              const isEdit = editingId === r.id;

              return (
                <tr key={r.id} className="border-t border-black/10">
                  <td className="p-3">
                    {isEdit ? (
                      <select
                        value={cpTypeLabel[(editDraft.cp_type as CpType) ?? r.cp_type]}
                        onChange={(e) =>
                          setEditDraft((d) => ({
                            ...d,
                            cp_type: labelToCpType[e.target.value],
                          }))
                        }
                        className="rounded-lg border border-black/20 px-2 py-1 bg-white"
                      >
                        {Object.values(cpTypeLabel).map((lbl) => (
                          <option key={lbl} value={lbl}>
                            {lbl}
                          </option>
                        ))}
                      </select>
) : (
  (() => {
    const label = cpTypeLabel[r.cp_type];

    const base =
      "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border";

    const styles: Record<CpType, string> = {
      issuer_dealer: "bg-blue-50 text-blue-700 border-blue-200",   // Dealer
      custodian: "bg-green-50 text-green-700 border-green-200",    // Custodian
      internal: "bg-yellow-50 text-yellow-700 border-yellow-200",  // Internal
      other: "bg-gray-100 text-gray-700 border-gray-200",          // Other
    };

    return (
      <span className={`${base} ${styles[r.cp_type]}`}>
        {label}
      </span>
    );
  })()
)}
                  </td>

                  <td className="p-3">
                    {isEdit ? (
                      <input
                        value={(editDraft.legal_name as string) ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, legal_name: e.target.value }))
                        }
                        className="w-full rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : (
                      <span className="font-semibold text-black">{r.legal_name}</span>
                    )}
                  </td>

                  <td className="p-3">
                    {isEdit ? (
                      <input
                        value={(editDraft.country_code as string) ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, country_code: e.target.value }))
                        }
                        className="w-24 rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : (
                      r.country_code ?? "-"
                    )}
                  </td>

                  <td className="p-3">
                    {isEdit ? (
                      <input
                        value={(editDraft.lei as string) ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, lei: e.target.value }))
                        }
                        className="w-full rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : (
                      r.lei ?? "-"
                    )}
                  </td>

                  <td className="p-3">
                    {isEdit ? (
                      <input
                        value={(editDraft.ssi as string) ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, ssi: e.target.value }))
                        }
                        className="w-full rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : (
                      r.ssi ?? "-"
                    )}
                  </td>

                  <td className="p-3">
                    {isEdit ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={saveEdit}
                          className="rounded-lg bg-[#002651] text-white px-3 py-1 text-sm hover:opacity-95"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded-lg border border-black/20 px-3 py-1 text-sm hover:bg-black/5"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className={iconBtn}
                          title="Edit"
                          aria-label="Edit counterparty"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          className={iconBtn + " hover:bg-red-50"}
                          title="Delete"
                          aria-label="Delete counterparty"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {sorted.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-black/60">
                  No counterparties yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}