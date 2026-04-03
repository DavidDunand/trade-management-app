"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { useProfile } from "../profile-context";
import { Pencil, Trash2 } from "lucide-react";

type SalesPerson = {
  id: string;
  first_name: string;
  family_name: string;
  email: string | null;
};

export default function SalesPage() {
  const isAdmin = useProfile()?.role === "admin";
  const [rows, setRows] = useState<SalesPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const [firstName, setFirstName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [email, setEmail] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<SalesPerson>>({});

  const fetchRows = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_people")
      .select("id, first_name, family_name, email")
      .order("family_name");

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
      const hay = `${r.first_name} ${r.family_name} ${r.email ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const addRow = async () => {
    if (!firstName.trim() || !familyName.trim()) return;

    const { error } = await supabase.from("sales_people").insert([
      {
        first_name: firstName.trim(),
        family_name: familyName.trim(),
        email: email.trim() ? email.trim() : null,
      },
    ]);

    if (error) return alert(error.message);

    setFirstName("");
    setFamilyName("");
    setEmail("");
    fetchRows();
  };

  const startEdit = (r: SalesPerson) => {
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
      first_name: (editDraft.first_name ?? "").trim(),
      family_name: (editDraft.family_name ?? "").trim(),
      email: (editDraft.email ?? "").trim() || null,
    };

    if (!payload.first_name || !payload.family_name) {
      return alert("First name and family name are required.");
    }

    const { error } = await supabase
      .from("sales_people")
      .update(payload)
      .eq("id", editingId);

    if (error) return alert(error.message);

    cancelEdit();
    fetchRows();
  };

  const removeRow = async (id: string) => {
    if (!confirm("Delete this sales person?")) return;
    const { error } = await supabase.from("sales_people").delete().eq("id", id);
    if (error) return alert(error.message);
    if (editingId === id) cancelEdit();
    fetchRows();
  };

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 bg-white hover:bg-black/5 active:scale-[0.98] transition";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-black">Sales</h1>
          <div className="text-sm text-black/60">Sales people list</div>
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

      {isAdmin && <div className="rounded-2xl border border-black/10 p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="First Name"
            className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
          />
          <input
            value={familyName}
            onChange={(e) => setFamilyName(e.target.value)}
            placeholder="Family Name"
            className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
          />
          <button
            onClick={addRow}
            className="rounded-xl bg-[#002651] text-white px-4 py-2 text-sm font-bold hover:opacity-95"
          >
            Add
          </button>
        </div>
      </div>}

      <div className="rounded-2xl border border-black/10 overflow-hidden">
        {/* removed global font-bold */}
        <table className="w-full text-sm">
          {/* header style aligned with Products/Issuers/Counterparties */}
          <thead className="bg-black/5 text-left">
            <tr>
              <th className="p-3 font-semibold text-black/80">First Name</th>
              <th className="p-3 font-semibold text-black/80">Family Name</th>
              <th className="p-3 font-semibold text-black/80">Email</th>
              <th className="p-3 w-28" />
            </tr>
          </thead>

          <tbody>
            {filtered.map((r) => {
              const isEdit = editingId === r.id;

              return (
                <tr key={r.id} className="border-t border-black/10">
                  <td className="p-3">
                    {isEdit ? (
                      <input
                        value={(editDraft.first_name as string) ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, first_name: e.target.value }))
                        }
                        className="w-full rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : (
                      r.first_name
                    )}
                  </td>

                  <td className="p-3">
                    {isEdit ? (
                      <input
                        value={(editDraft.family_name as string) ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, family_name: e.target.value }))
                        }
                        className="w-full rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : (
                      <span className="font-semibold text-black">{r.family_name}</span>
                    )}
                  </td>

                  <td className="p-3">
                    {isEdit ? (
                      <input
                        value={(editDraft.email as string) ?? ""}
                        onChange={(e) =>
                          setEditDraft((d) => ({ ...d, email: e.target.value }))
                        }
                        className="w-full rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : (
                      r.email ?? "-"
                    )}
                  </td>

                  <td className="p-3">
                    {isAdmin && (isEdit ? (
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
                          aria-label="Edit sales person"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          className={iconBtn + " hover:bg-red-50"}
                          title="Delete"
                          aria-label="Delete sales person"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-black/60">
                  No sales people yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}