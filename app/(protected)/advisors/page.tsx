"use client";
export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import {
  Pencil,
  Trash2,
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

type AdvisorType = "client" | "introducer";

type Advisor = {
  id: string;
  advisor_type: AdvisorType;
  legal_name: string;
  country_code: string | null;
  owner_sales_id: string | null;
  owner?: { id: string; first_name: string; family_name: string } | null;
};

type Contact = {
  id: string;
  advisor_id: string;
  first_name: string;
  family_name: string;
  email: string | null;
};

type SalesPerson = {
  id: string;
  first_name: string;
  family_name: string;
};

function fullSalesName(s?: SalesPerson | null) {
  if (!s) return "-";
  return `${s.first_name} ${s.family_name}`;
}

type SortKey = "legal_name" | "country_code" | "owner" | null;
type SortDir = "asc" | "desc";

export default function AdvisorsPage() {
  const [mode, setMode] = useState<AdvisorType>("client");

  const [rows, setRows] = useState<Advisor[]>([]);
  const [salesPeople, setSalesPeople] = useState<SalesPerson[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");

  // add advisor
  const [legalName, setLegalName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [ownerSalesId, setOwnerSalesId] = useState<string>("");

  // advisor edit
  const [editingAdvisorId, setEditingAdvisorId] = useState<string | null>(null);
  const [advisorDraft, setAdvisorDraft] = useState<Partial<Advisor>>({});

  // contacts drawer
  const [openAdvisor, setOpenAdvisor] = useState<Advisor | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);

  // add contact
  const [contactFirst, setContactFirst] = useState("");
  const [contactFamily, setContactFamily] = useState("");
  const [contactEmail, setContactEmail] = useState("");

  // contact edit
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState<Partial<Contact>>({});

  // sorting (client-side only)
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchSales = async () => {
    const { data, error } = await supabase
      .from("sales_people")
      .select("id, first_name, family_name")
      .order("family_name");

    if (error) alert(error.message);
    setSalesPeople((data ?? []) as any);
  };

  const fetchRows = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("advisors")
      .select(
        `
        id,
        advisor_type,
        legal_name,
        country_code,
        owner_sales_id,
        owner:owner_sales_id(id, first_name, family_name)
      `
      )
      .eq("advisor_type", mode)
      .order("legal_name");

    if (error) alert(error.message);
    setRows((data ?? []) as any);

    setLoading(false);
  };

  const fetchContacts = async (advisorId: string) => {
    const { data, error } = await supabase
      .from("advisor_contacts")
      .select("id, advisor_id, first_name, family_name, email")
      .eq("advisor_id", advisorId)
      .order("family_name");

    if (error) alert(error.message);
    setContacts((data ?? []) as any);
  };

  useEffect(() => {
    fetchSales();
  }, []);

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.legal_name, r.country_code, fullSalesName(r.owner as any)]
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

    const getVal = (r: Advisor) => {
      if (sortKey === "legal_name") return (r.legal_name ?? "").toLowerCase();
      if (sortKey === "country_code") return (r.country_code ?? "").toLowerCase();
      if (sortKey === "owner") return fullSalesName(r.owner as any).toLowerCase();
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

  const addAdvisor = async () => {
    if (!legalName.trim() || !countryCode.trim()) return;

    const payload = {
      advisor_type: mode,
      legal_name: legalName.trim(),
      country_code: countryCode.trim().toUpperCase(),
      owner_sales_id: ownerSalesId || null,
    };

    const { error } = await supabase.from("advisors").insert([payload]);
    if (error) return alert(error.message);

    setLegalName("");
    setCountryCode("");
    setOwnerSalesId("");
    fetchRows();
  };

  const deleteAdvisor = async (id: string) => {
    if (!confirm("Delete this entry? Contacts will be deleted too.")) return;
    const { error } = await supabase.from("advisors").delete().eq("id", id);
    if (error) return alert(error.message);
    fetchRows();
  };

  const startAdvisorEdit = (a: Advisor) => {
    setEditingAdvisorId(a.id);
    setAdvisorDraft({
      id: a.id,
      legal_name: a.legal_name,
      country_code: a.country_code,
      owner_sales_id: a.owner_sales_id,
    });
  };

  const cancelAdvisorEdit = () => {
    setEditingAdvisorId(null);
    setAdvisorDraft({});
  };

  const saveAdvisorEdit = async () => {
    if (!editingAdvisorId) return;

    const payload = {
      legal_name: (advisorDraft.legal_name ?? "").trim(),
      country_code: (advisorDraft.country_code ?? "").trim().toUpperCase() || null,
      owner_sales_id: (advisorDraft.owner_sales_id as any) || null,
    };

    if (!payload.legal_name) return alert("Legal Name is required.");

    const { error } = await supabase
      .from("advisors")
      .update(payload)
      .eq("id", editingAdvisorId);
    if (error) return alert(error.message);

    cancelAdvisorEdit();
    fetchRows();

    if (openAdvisor?.id === editingAdvisorId) {
      const refreshed = rows.find((x) => x.id === editingAdvisorId);
      if (refreshed) setOpenAdvisor(refreshed);
    }
  };

  const openContactsDrawer = async (a: Advisor) => {
    setOpenAdvisor(a);
    setContacts([]);
    setEditingContactId(null);
    setContactDraft({});
    setContactFirst("");
    setContactFamily("");
    setContactEmail("");
    await fetchContacts(a.id);
  };

  const addContact = async () => {
    if (!openAdvisor) return;
    if (!contactFirst.trim() || !contactFamily.trim() || !contactEmail.trim()) return;

    const payload = {
      advisor_id: openAdvisor.id,
      first_name: contactFirst.trim(),
      family_name: contactFamily.trim(),
      email: contactEmail.trim(),
    };

    const { error } = await supabase.from("advisor_contacts").insert([payload]);
    if (error) return alert(error.message);

    setContactFirst("");
    setContactFamily("");
    setContactEmail("");
    fetchContacts(openAdvisor.id);
  };

  const startContactEdit = (c: Contact) => {
    setEditingContactId(c.id);
    setContactDraft({
      id: c.id,
      first_name: c.first_name,
      family_name: c.family_name,
      email: c.email ?? "",
    });
  };

  const cancelContactEdit = () => {
    setEditingContactId(null);
    setContactDraft({});
  };

  const saveContactEdit = async () => {
    if (!editingContactId) return;

    const payload = {
      first_name: (contactDraft.first_name ?? "").trim(),
      family_name: (contactDraft.family_name ?? "").trim(),
      email: (contactDraft.email ?? "").trim() || null,
    };

    if (!payload.first_name || !payload.family_name || !payload.email) {
      return alert("First name, family name and email are required.");
    }

    const { error } = await supabase
      .from("advisor_contacts")
      .update(payload)
      .eq("id", editingContactId);
    if (error) return alert(error.message);

    cancelContactEdit();
    if (openAdvisor) fetchContacts(openAdvisor.id);
  };

  const deleteContact = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    const { error } = await supabase.from("advisor_contacts").delete().eq("id", id);
    if (error) return alert(error.message);
    if (openAdvisor) fetchContacts(openAdvisor.id);
  };

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 bg-white hover:bg-black/5 active:scale-[0.98] transition";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-black">Clients / Introducers</h1>
          <div className="text-sm text-black/60">
            Companies + multiple contacts (email stored for automation later)
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setMode("client")}
            className={[
              "rounded-xl px-4 py-2 text-sm font-bold border",
              mode === "client"
                ? "bg-[#002651] text-white border-[#002651]"
                : "bg-white text-black border-black/20 hover:bg-black/5",
            ].join(" ")}
          >
            Clients
          </button>

          <button
            onClick={() => setMode("introducer")}
            className={[
              "rounded-xl px-4 py-2 text-sm font-bold border",
              mode === "introducer"
                ? "bg-[#002651] text-white border-[#002651]"
                : "bg-white text-black border-black/20 hover:bg-black/5",
            ].join(" ")}
          >
            Introducers
          </button>

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
      <div className="rounded-2xl border border-black/10 p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder={`Legal Name (${mode === "client" ? "Client" : "Introducer"})`}
            className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold md:col-span-3"
          />
          <input
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            placeholder="Country Code (FR)"
            className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
          />
          <select
            value={ownerSalesId}
            onChange={(e) => setOwnerSalesId(e.target.value)}
            className="rounded-xl border border-black/20 px-3 py-2 bg-white text-sm font-bold md:col-span-1"
            title="Client Owner"
          >
            <option value="">Client Owner (optional)</option>
            {salesPeople.map((s) => (
              <option key={s.id} value={s.id}>
                {s.first_name} {s.family_name}
              </option>
            ))}
          </select>
          <button
            onClick={addAdvisor}
            className="rounded-xl bg-[#002651] text-white px-4 py-2 text-sm font-bold hover:opacity-95"
          >
            Add
          </button>
        </div>
      </div>

      {/* Table */}
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

              <th className="p-3 w-28">
                <button
                  type="button"
                  onClick={() => toggleSort("country_code")}
                  className="inline-flex items-center gap-2 font-semibold text-black/80 hover:text-black"
                  title="Sort by Country"
                >
                  Country <SortIcon k="country_code" />
                </button>
              </th>

              <th className="p-3">
                <button
                  type="button"
                  onClick={() => toggleSort("owner")}
                  className="inline-flex items-center gap-2 font-semibold text-black/80 hover:text-black"
                  title="Sort by Client Owner"
                >
                  Client Owner <SortIcon k="owner" />
                </button>
              </th>

              <th className="p-3 w-44" />
            </tr>
          </thead>

          <tbody>
            {sorted.map((r) => {
              const isEdit = editingAdvisorId === r.id;

              return (
                <tr key={r.id} className="border-t border-black/10">
                  <td className="p-3">
                    {isEdit ? (
                      <input
                        value={(advisorDraft.legal_name as string) ?? ""}
                        onChange={(e) =>
                          setAdvisorDraft((d) => ({ ...d, legal_name: e.target.value }))
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
                        value={(advisorDraft.country_code as string) ?? ""}
                        onChange={(e) =>
                          setAdvisorDraft((d) => ({ ...d, country_code: e.target.value }))
                        }
                        className="w-24 rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : (
                      r.country_code ?? "-"
                    )}
                  </td>

                  <td className="p-3">
                    {isEdit ? (
                      <select
                        value={(advisorDraft.owner_sales_id as string) ?? ""}
                        onChange={(e) =>
                          setAdvisorDraft((d) => ({
                            ...d,
                            owner_sales_id: e.target.value || null,
                          }))
                        }
                        className="rounded-lg border border-black/20 px-2 py-1 bg-white"
                      >
                        <option value="">—</option>
                        {salesPeople.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.first_name} {s.family_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-semibold text-black">
                        {fullSalesName((r.owner as any) ?? null)}
                      </span>
                    )}
                  </td>

                  <td className="p-3">
                    {isEdit ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={saveAdvisorEdit}
                          className="rounded-lg bg-[#002651] text-white px-3 py-1 text-sm hover:opacity-95"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelAdvisorEdit}
                          className="rounded-lg border border-black/20 px-3 py-1 text-sm hover:bg-black/5"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openContactsDrawer(r)}
                          className={iconBtn}
                          title="Manage contacts"
                          aria-label="Manage contacts"
                        >
                          <Users className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => startAdvisorEdit(r)}
                          className={iconBtn}
                          title="Edit"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteAdvisor(r.id)}
                          className={iconBtn + " hover:bg-red-50"}
                          title="Delete"
                          aria-label="Delete"
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
                <td colSpan={4} className="p-6 text-black/60">
                  No entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Contacts drawer */}
      {openAdvisor && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpenAdvisor(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl border-l border-black/10 flex flex-col">
            <div className="px-5 py-4 bg-[#002651] text-white flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Contacts</div>
                <div className="text-xs text-white/80">{openAdvisor.legal_name}</div>
              </div>
              <button
                onClick={() => setOpenAdvisor(null)}
                className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Add contact */}
              <div className="rounded-2xl border border-black/10 p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    value={contactFirst}
                    onChange={(e) => setContactFirst(e.target.value)}
                    placeholder="First Name"
                    className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
                  />
                  <input
                    value={contactFamily}
                    onChange={(e) => setContactFamily(e.target.value)}
                    placeholder="Family Name"
                    className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
                  />
                  <input
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="Email"
                    className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={addContact}
                    className="rounded-xl bg-[#002651] text-white px-4 py-2 text-sm font-bold hover:opacity-95"
                  >
                    Add contact
                  </button>
                </div>
              </div>

              {/* Contacts table */}
              <div className="rounded-2xl border border-black/10 overflow-x-auto">
                <table className="min-w-[720px] w-full table-fixed text-sm font-bold">
                  <colgroup>
                    <col className="w-[120px]" />
                    <col className="w-[140px]" />
                    <col />
                    <col className="w-[200px]" />
                  </colgroup>

                  <thead className="bg-black/5 text-left">
                    <tr>
                      <th className="p-3">First Name</th>
                      <th className="p-3">Family Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3"></th>
                    </tr>
                  </thead>

                  <tbody>
                    {contacts.map((c) => {
                      const isEdit = editingContactId === c.id;

                      return (
                        <tr key={c.id} className="border-t border-black/10 align-top">
                          <td className="p-3">
                            {isEdit ? (
                              <input
                                value={(contactDraft.first_name as string) ?? ""}
                                onChange={(e) =>
                                  setContactDraft((d) => ({ ...d, first_name: e.target.value }))
                                }
                                className="w-full rounded-lg border border-black/20 px-2 py-1"
                              />
                            ) : (
                              <div className="truncate" title={c.first_name}>
                                {c.first_name}
                              </div>
                            )}
                          </td>

                          <td className="p-3">
                            {isEdit ? (
                              <input
                                value={(contactDraft.family_name as string) ?? ""}
                                onChange={(e) =>
                                  setContactDraft((d) => ({ ...d, family_name: e.target.value }))
                                }
                                className="w-full rounded-lg border border-black/20 px-2 py-1"
                              />
                            ) : (
                              <div className="truncate" title={c.family_name}>
                                {c.family_name}
                              </div>
                            )}
                          </td>

                          <td className="p-3">
                            {isEdit ? (
                              <input
                                value={(contactDraft.email as string) ?? ""}
                                onChange={(e) =>
                                  setContactDraft((d) => ({ ...d, email: e.target.value }))
                                }
                                className="w-full rounded-lg border border-black/20 px-2 py-1"
                              />
                            ) : (
                              <div className="truncate" title={c.email ?? ""}>
                                {c.email ?? "-"}
                              </div>
                            )}
                          </td>

                          <td className="p-3">
                            {isEdit ? (
                              <div className="flex justify-end gap-2 whitespace-nowrap">
                                <button
                                  onClick={saveContactEdit}
                                  className="rounded-lg bg-[#002651] text-white px-3 py-1 text-sm hover:opacity-95"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={cancelContactEdit}
                                  className="rounded-lg border border-black/20 px-3 py-1 text-sm hover:bg-black/5"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
<div className="flex justify-end items-center gap-2 whitespace-nowrap">
  <button
    type="button"
    onClick={() => startContactEdit(c)}
    className={iconBtn}
    title="Edit"
    aria-label="Edit contact"
  >
    <Pencil className="h-4 w-4" />
  </button>

  <button
    type="button"
    onClick={() => deleteContact(c.id)}
    className={iconBtn + " hover:bg-red-50"}
    title="Delete"
    aria-label="Delete contact"
  >
    <Trash2 className="h-4 w-4 text-red-600" />
  </button>
</div>
                            )}
                          </td>
                        </tr>
                      );
                    })}

                    {contacts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-black/60">
                          No contacts yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="text-xs text-black/60">
                Contacts are deleted automatically if you delete the company.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}