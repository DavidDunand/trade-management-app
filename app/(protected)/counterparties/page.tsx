"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { useProfile } from "../profile-context";
import { Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Building2, Plus, X, Users } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CpType = "issuer_dealer" | "custodian" | "internal" | "other";

type Counterparty = {
  id: string;
  legal_name: string;
  country_code: string | null;
  lei: string | null;
  ssi: string | null;
  cp_type: CpType;
};

type BillingRecord = {
  id: string;
  counterparty_id: string;
  billing_entity: string;
  postal_address: string;
  vat_number: string | null;
  billing_email: string | null;
};

type CpContact = {
  id: string;
  counterparty_id: string;
  first_name: string;
  family_name: string;
  email: string | null;
};

type BankAccountRecord = {
  id: string;
  counterparty_id: string;
  currency: string;
  bank_name: string;
  iban: string | null;
  account_number: string | null;
  sort_code: string | null;
  bic: string | null;
  intermediary_bic: string | null;
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

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "Other"];

const emptyBankDraft = {
  currency: "EUR",
  bank_name: "",
  iban: "",
  account_number: "",
  sort_code: "",
  bic: "",
  intermediary_bic: "",
};

const emptyBillingDraft = {
  billing_entity: "",
  postal_address: "",
  vat_number: "",
  billing_email: "",
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CounterpartiesPage() {
  const isAdmin = useProfile()?.role === "admin";
  const [rows, setRows] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Add form
  const [cpType, setCpType] = useState<CpType>("custodian");
  const [legalName, setLegalName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [lei, setLei] = useState("");
  const [ssi, setSsi] = useState("");

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Counterparty>>({});

  // Sorting
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Billing modal
  const [billingCp, setBillingCp] = useState<Counterparty | null>(null);
  const [billingTab, setBillingTab] = useState<"billing" | "banking">("billing");
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingRecord, setBillingRecord] = useState<BillingRecord | null>(null);
  const [billingDraft, setBillingDraft] = useState({ ...emptyBillingDraft });
  const [bankAccounts, setBankAccounts] = useState<BankAccountRecord[]>([]);
  const [bankDraft, setBankDraft] = useState({ ...emptyBankDraft });
  const [savingBilling, setSavingBilling] = useState(false);
  const [addingBank, setAddingBank] = useState(false);

  // Contacts drawer
  const [openCp, setOpenCp] = useState<Counterparty | null>(null);
  const [cpContacts, setCpContacts] = useState<CpContact[]>([]);
  const [contactFirst, setContactFirst] = useState("");
  const [contactFamily, setContactFamily] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState<Partial<CpContact>>({});

  // ─── Counterparty CRUD ──────────────────────────────────────────────────────

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

  useEffect(() => { fetchRows(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = [r.legal_name, r.country_code, r.lei, r.ssi, cpTypeLabel[r.cp_type]]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const toggleSort = (key: Exclude<SortKey, null>) => {
    setSortKey((prev) => {
      if (prev !== key) { setSortDir("asc"); return key; }
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return prev;
    });
  };

  const SortIcon = ({ k }: { k: Exclude<SortKey, null> }) => {
    if (sortKey !== k) return <ArrowUpDown className="h-4 w-4 opacity-60" />;
    return sortDir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />;
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
      const av = getVal(a), bv = getVal(b);
      if (av < bv) return -1 * dirMul;
      if (av > bv) return 1 * dirMul;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const resetAdd = () => { setCpType("custodian"); setLegalName(""); setCountryCode(""); setLei(""); setSsi(""); };

  const addRow = async () => {
    if (!legalName.trim() || !countryCode.trim()) return;
    const { error } = await supabase.from("counterparties").insert([{
      cp_type: cpType,
      legal_name: legalName.trim(),
      country_code: countryCode.trim().toUpperCase(),
      lei: lei.trim() || null,
      ssi: ssi.trim() || null,
    }]);
    if (error) return alert(error.message);
    resetAdd();
    fetchRows();
  };

  const startEdit = (r: Counterparty) => { setEditingId(r.id); setEditDraft({ ...r }); };
  const cancelEdit = () => { setEditingId(null); setEditDraft({}); };

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
    const { error } = await supabase.from("counterparties").update(payload).eq("id", editingId);
    if (error) return alert(error.message);
    cancelEdit();
    fetchRows();
  };

  const removeRow = async (id: string) => {
    if (!confirm("Delete this counterparty? This will fail if it is referenced by trades (expected).")) return;
    const { error } = await supabase.from("counterparties").delete().eq("id", id);
    if (error) return alert(error.message);
    if (editingId === id) cancelEdit();
    fetchRows();
  };

  // ─── Billing modal ──────────────────────────────────────────────────────────

  const openBillingModal = async (cp: Counterparty) => {
    setBillingCp(cp);
    setBillingTab("billing");
    setBillingLoading(true);
    setBillingRecord(null);
    setBillingDraft({ ...emptyBillingDraft });
    setBankAccounts([]);
    setBankDraft({ ...emptyBankDraft });

    const [{ data: billing }, { data: banks }] = await Promise.all([
      supabase.from("counterparty_billing").select("*").eq("counterparty_id", cp.id).maybeSingle(),
      cp.cp_type === "internal"
        ? supabase.from("counterparty_bank_accounts").select("*").eq("counterparty_id", cp.id).order("currency")
        : Promise.resolve({ data: [] }),
    ]);

    const b = billing as BillingRecord | null;
    setBillingRecord(b);
    setBillingDraft({
      billing_entity: b?.billing_entity ?? "",
      postal_address: b?.postal_address ?? "",
      vat_number: b?.vat_number ?? "",
      billing_email: b?.billing_email ?? "",
    });
    setBankAccounts((banks as BankAccountRecord[]) ?? []);
    setBillingLoading(false);
  };

  const closeBillingModal = () => {
    setBillingCp(null);
    setBillingRecord(null);
    setBankAccounts([]);
  };

  const saveBilling = async () => {
    if (!billingCp) return;
    if (!billingDraft.billing_entity.trim() || !billingDraft.postal_address.trim()) {
      alert("Billing Entity and Postal Address are required.");
      return;
    }
    setSavingBilling(true);

    const payload = {
      counterparty_id: billingCp.id,
      billing_entity: billingDraft.billing_entity.trim(),
      postal_address: billingDraft.postal_address.trim(),
      vat_number: billingDraft.vat_number.trim() || null,
      billing_email: billingDraft.billing_email.trim() || null,
    };

    let error;
    if (billingRecord) {
      ({ error } = await supabase.from("counterparty_billing").update(payload).eq("id", billingRecord.id));
    } else {
      const { error: insertError, data } = await supabase
        .from("counterparty_billing").insert(payload).select().single();
      error = insertError;
      if (data) setBillingRecord(data as BillingRecord);
    }

    if (error) alert(error.message);
    else {
      // Re-fetch to get latest
      const { data } = await supabase.from("counterparty_billing").select("*").eq("counterparty_id", billingCp.id).maybeSingle();
      setBillingRecord(data as BillingRecord | null);
    }
    setSavingBilling(false);
  };

  const addBankAccount = async () => {
    if (!billingCp) return;
    if (!bankDraft.bank_name.trim()) { alert("Bank Name is required."); return; }
    setAddingBank(true);

    const { data, error } = await supabase.from("counterparty_bank_accounts").insert({
      counterparty_id: billingCp.id,
      currency: bankDraft.currency,
      bank_name: bankDraft.bank_name.trim(),
      iban: bankDraft.iban.trim() || null,
      account_number: bankDraft.account_number.trim() || null,
      sort_code: bankDraft.sort_code.trim() || null,
      bic: bankDraft.bic.trim() || null,
      intermediary_bic: bankDraft.intermediary_bic.trim() || null,
    }).select().single();

    if (error) alert(error.message);
    else if (data) {
      setBankAccounts((prev) => [...prev, data as BankAccountRecord]);
      setBankDraft({ ...emptyBankDraft });
    }
    setAddingBank(false);
  };

  const removeBankAccount = async (id: string) => {
    if (!confirm("Remove this bank account?")) return;
    const { error } = await supabase.from("counterparty_bank_accounts").delete().eq("id", id);
    if (error) alert(error.message);
    else setBankAccounts((prev) => prev.filter((a) => a.id !== id));
  };

  // ─── Contacts drawer ────────────────────────────────────────────────────────

  const fetchCpContacts = async (cpId: string) => {
    const { data, error } = await supabase
      .from("counterparty_contacts")
      .select("id, counterparty_id, first_name, family_name, email")
      .eq("counterparty_id", cpId)
      .order("family_name");
    if (error) alert(error.message);
    setCpContacts((data ?? []) as any);
  };

  const openContactsDrawer = async (cp: Counterparty) => {
    setOpenCp(cp);
    setCpContacts([]);
    setEditingContactId(null);
    setContactDraft({});
    setContactFirst("");
    setContactFamily("");
    setContactEmail("");
    await fetchCpContacts(cp.id);
  };

  const addCpContact = async () => {
    if (!openCp) return;
    if (!contactFirst.trim() || !contactFamily.trim()) return;
    const { error } = await supabase.from("counterparty_contacts").insert([{
      counterparty_id: openCp.id,
      first_name: contactFirst.trim(),
      family_name: contactFamily.trim(),
      email: contactEmail.trim() || null,
    }]);
    if (error) return alert(error.message);
    setContactFirst("");
    setContactFamily("");
    setContactEmail("");
    fetchCpContacts(openCp.id);
  };

  const startContactEdit = (c: CpContact) => {
    setEditingContactId(c.id);
    setContactDraft({ ...c, email: c.email ?? "" });
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
    if (!payload.first_name || !payload.family_name) return alert("First and family name are required.");
    const { error } = await supabase.from("counterparty_contacts").update(payload).eq("id", editingContactId);
    if (error) return alert(error.message);
    cancelContactEdit();
    if (openCp) fetchCpContacts(openCp.id);
  };

  const deleteCpContact = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    const { error } = await supabase.from("counterparty_contacts").delete().eq("id", id);
    if (error) return alert(error.message);
    if (openCp) fetchCpContacts(openCp.id);
  };

  // ─── Shared styles ──────────────────────────────────────────────────────────

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 bg-white hover:bg-black/5 active:scale-[0.98] transition";

  const inputCls = "w-full rounded-lg border border-black/20 px-3 py-2 text-sm";
  const labelCls = "block text-xs font-bold text-black/50 mb-1";

  const cpBadge = (r: Counterparty) => {
    const label = cpTypeLabel[r.cp_type];
    const styles: Record<CpType, string> = {
      issuer_dealer: "bg-blue-50 text-blue-700 border-blue-200",
      custodian: "bg-green-50 text-green-700 border-green-200",
      internal: "bg-yellow-50 text-yellow-700 border-yellow-200",
      other: "bg-gray-100 text-gray-700 border-gray-200",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${styles[r.cp_type]}`}>
        {label}
      </span>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-black">Counterparties</h1>
          <div className="text-sm text-black/60">Dealer / Custodian / Internal / Other</div>
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

      {/* Add form */}
      {isAdmin && (
        <div className="rounded-2xl border border-black/10 p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <select
              value={cpTypeLabel[cpType]}
              onChange={(e) => setCpType(labelToCpType[e.target.value])}
              className="rounded-xl border border-black/20 px-3 py-2 bg-white text-sm font-bold"
            >
              {Object.values(cpTypeLabel).map((lbl) => (
                <option key={lbl} value={lbl}>{lbl}</option>
              ))}
            </select>
            <input value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Legal Name" className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold md:col-span-2" />
            <input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="Country Code (FR)" className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold" />
            <button onClick={addRow} className="rounded-xl bg-[#002651] text-white px-4 py-2 text-sm font-bold hover:opacity-95">Add</button>
            <input value={lei} onChange={(e) => setLei(e.target.value)} placeholder="LEI (optional)" className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold md:col-span-2" />
            <input value={ssi} onChange={(e) => setSsi(e.target.value)} placeholder="SSI (optional)" className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold md:col-span-2" />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-black/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left">
            <tr>
              <th className="p-3">
                <button type="button" onClick={() => toggleSort("cp_type")} className="inline-flex items-center gap-2 font-semibold text-black/80 hover:text-black">
                  Type <SortIcon k="cp_type" />
                </button>
              </th>
              <th className="p-3">
                <button type="button" onClick={() => toggleSort("legal_name")} className="inline-flex items-center gap-2 font-semibold text-black/80 hover:text-black">
                  Legal Name <SortIcon k="legal_name" />
                </button>
              </th>
              <th className="p-3">
                <button type="button" onClick={() => toggleSort("country_code")} className="inline-flex items-center gap-2 font-semibold text-black/80 hover:text-black">
                  Country <SortIcon k="country_code" />
                </button>
              </th>
              <th className="p-3">LEI</th>
              <th className="p-3">SSI</th>
              <th className="p-3 w-40"></th>
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
                        onChange={(e) => setEditDraft((d) => ({ ...d, cp_type: labelToCpType[e.target.value] }))}
                        className="rounded-lg border border-black/20 px-2 py-1 bg-white"
                      >
                        {Object.values(cpTypeLabel).map((lbl) => <option key={lbl} value={lbl}>{lbl}</option>)}
                      </select>
                    ) : cpBadge(r)}
                  </td>
                  <td className="p-3">
                    {isEdit ? (
                      <input value={(editDraft.legal_name as string) ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, legal_name: e.target.value }))} className="w-full rounded-lg border border-black/20 px-2 py-1" />
                    ) : (
                      <span className="font-semibold text-black">{r.legal_name}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEdit ? (
                      <input value={(editDraft.country_code as string) ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, country_code: e.target.value }))} className="w-24 rounded-lg border border-black/20 px-2 py-1" />
                    ) : (r.country_code ?? "-")}
                  </td>
                  <td className="p-3">
                    {isEdit ? (
                      <input value={(editDraft.lei as string) ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, lei: e.target.value }))} className="w-full rounded-lg border border-black/20 px-2 py-1" />
                    ) : (r.lei ?? "-")}
                  </td>
                  <td className="p-3">
                    {isEdit ? (
                      <input value={(editDraft.ssi as string) ?? ""} onChange={(e) => setEditDraft((d) => ({ ...d, ssi: e.target.value }))} className="w-full rounded-lg border border-black/20 px-2 py-1" />
                    ) : (r.ssi ?? "-")}
                  </td>
                  <td className="p-3">
                    {isEdit ? (
                      <div className="flex justify-end gap-2">
                        {isAdmin && <button onClick={saveEdit} className="rounded-lg bg-[#002651] text-white px-3 py-1 text-sm hover:opacity-95">Save</button>}
                        <button onClick={cancelEdit} className="rounded-lg border border-black/20 px-3 py-1 text-sm hover:bg-black/5">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex justify-end items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openContactsDrawer(r)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-xs font-bold hover:bg-black/5 transition"
                          title="Manage Contacts"
                        >
                          <Users className="h-3.5 w-3.5" />
                          Contacts
                        </button>
                        <button
                          type="button"
                          onClick={() => openBillingModal(r)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-xs font-bold hover:bg-black/5 transition"
                          title="Billing Details"
                        >
                          <Building2 className="h-3.5 w-3.5" />
                          Billing
                        </button>
                        {isAdmin && (
                          <button type="button" onClick={() => startEdit(r)} className={iconBtn} title="Edit" aria-label="Edit counterparty">
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {isAdmin && (
                          <button type="button" onClick={() => removeRow(r.id)} className={iconBtn + " hover:bg-red-50"} title="Delete" aria-label="Delete counterparty">
                            <Trash2 className="h-4 w-4 text-red-600" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-black/60">No counterparties yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Contacts Drawer ── */}
      {openCp && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpenCp(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl border-l border-black/10 flex flex-col">
            <div className="px-5 py-4 bg-[#002651] text-white flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Contacts</div>
                <div className="text-xs text-white/80">{openCp.legal_name}</div>
              </div>
              <button
                onClick={() => setOpenCp(null)}
                className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15"
              >
                Close
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Add contact form */}
              {isAdmin && (
              <div className="rounded-2xl border border-black/10 p-4 space-y-3">
                <div className="grid grid-cols-3 gap-3">
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
                    type="email"
                    className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={addCpContact}
                    className="rounded-xl bg-[#002651] text-white px-4 py-2 text-sm font-bold hover:opacity-95"
                  >
                    Add contact
                  </button>
                </div>
              </div>
              )}

              {/* Contacts list */}
              <div className="rounded-2xl border border-black/10 overflow-x-auto">
                <table className="min-w-[620px] w-full table-fixed text-sm font-bold">
                  <colgroup>
                    <col className="w-[120px]" />
                    <col className="w-[140px]" />
                    <col />
                    <col className="w-[160px]" />
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
                    {cpContacts.map((c) => {
                      const isEdit = editingContactId === c.id;
                      return (
                        <tr key={c.id} className="border-t border-black/10 align-top">
                          <td className="p-3">
                            {isEdit ? (
                              <input
                                value={(contactDraft.first_name as string) ?? ""}
                                onChange={(e) => setContactDraft((d) => ({ ...d, first_name: e.target.value }))}
                                className="w-full rounded-lg border border-black/20 px-2 py-1"
                              />
                            ) : (
                              <div className="truncate" title={c.first_name}>{c.first_name}</div>
                            )}
                          </td>
                          <td className="p-3">
                            {isEdit ? (
                              <input
                                value={(contactDraft.family_name as string) ?? ""}
                                onChange={(e) => setContactDraft((d) => ({ ...d, family_name: e.target.value }))}
                                className="w-full rounded-lg border border-black/20 px-2 py-1"
                              />
                            ) : (
                              <div className="truncate" title={c.family_name}>{c.family_name}</div>
                            )}
                          </td>
                          <td className="p-3">
                            {isEdit ? (
                              <input
                                value={(contactDraft.email as string) ?? ""}
                                onChange={(e) => setContactDraft((d) => ({ ...d, email: e.target.value }))}
                                className="w-full rounded-lg border border-black/20 px-2 py-1"
                              />
                            ) : (
                              <div className="truncate" title={c.email ?? ""}>{c.email ?? "-"}</div>
                            )}
                          </td>
                          <td className="p-3">
                            {isEdit ? (
                              <div className="flex justify-end gap-2 whitespace-nowrap">
                                {isAdmin && <button onClick={saveContactEdit} className="rounded-lg bg-[#002651] text-white px-3 py-1 text-sm hover:opacity-95">Save</button>}
                                <button onClick={cancelContactEdit} className="rounded-lg border border-black/20 px-3 py-1 text-sm hover:bg-black/5">Cancel</button>
                              </div>
                            ) : (
                              <div className="flex justify-end items-center gap-2 whitespace-nowrap">
                                {isAdmin && (
                                  <button type="button" onClick={() => startContactEdit(c)} className={iconBtn} title="Edit" aria-label="Edit contact">
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                )}
                                {isAdmin && (
                                  <button type="button" onClick={() => deleteCpContact(c.id)} className={iconBtn + " hover:bg-red-50"} title="Delete" aria-label="Delete contact">
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {cpContacts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-black/60">No contacts yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="text-xs text-black/60">Contacts are deleted automatically if you delete the counterparty.</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Billing Details Modal ── */}
      {billingCp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">

            {/* Modal header */}
            <div className="flex items-start justify-between p-5 border-b border-black/8">
              <div>
                <div className="text-base font-bold text-black">{billingCp.legal_name}</div>
                <div className="text-xs text-black/50 mt-0.5">Billing &amp; Banking Details</div>
              </div>
              <button onClick={closeBillingModal} className="rounded-lg p-1 hover:bg-black/5">
                <X className="h-5 w-5 text-black/50" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-5 pt-4">
              <button
                onClick={() => setBillingTab("billing")}
                className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${billingTab === "billing" ? "bg-[#002651] text-white" : "text-black/50 hover:bg-black/5"}`}
              >
                Billing Details
              </button>
              {billingCp.cp_type === "internal" && (
                <button
                  onClick={() => setBillingTab("banking")}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${billingTab === "banking" ? "bg-[#002651] text-white" : "text-black/50 hover:bg-black/5"}`}
                >
                  Banking Accounts
                </button>
              )}
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {billingLoading ? (
                <div className="text-sm text-black/40 py-8 text-center">Loading…</div>
              ) : billingTab === "billing" ? (
                /* ── BILLING TAB ── */
                <div className="space-y-3">
                  <div>
                    <label className={labelCls}>Billing Entity *</label>
                    <input value={billingDraft.billing_entity} onChange={(e) => setBillingDraft((d) => ({ ...d, billing_entity: e.target.value }))} placeholder="Legal entity name for invoices" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Postal Address *</label>
                    <textarea value={billingDraft.postal_address} onChange={(e) => setBillingDraft((d) => ({ ...d, postal_address: e.target.value }))} placeholder="Full postal address" rows={3} className={inputCls + " resize-none"} />
                  </div>
                  <div>
                    <label className={labelCls}>VAT Number</label>
                    <input value={billingDraft.vat_number} onChange={(e) => setBillingDraft((d) => ({ ...d, vat_number: e.target.value }))} placeholder="e.g. FR71849190335" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Billing Email</label>
                    <input value={billingDraft.billing_email} onChange={(e) => setBillingDraft((d) => ({ ...d, billing_email: e.target.value }))} placeholder="invoices@example.com" type="email" className={inputCls} />
                  </div>
                  {isAdmin && (
                    <button
                      onClick={saveBilling}
                      disabled={savingBilling}
                      className="w-full rounded-xl bg-[#002651] text-white py-2.5 text-sm font-bold hover:opacity-95 disabled:opacity-60 transition"
                    >
                      {savingBilling ? "Saving…" : billingRecord ? "Update Billing Details" : "Save Billing Details"}
                    </button>
                  )}
                </div>
              ) : (
                /* ── BANKING TAB (internal only) ── */
                <div className="space-y-5">

                  {/* Existing accounts */}
                  {bankAccounts.length === 0 ? (
                    <div className="text-sm text-black/40 text-center py-4">No banking accounts yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {bankAccounts.map((a) => (
                        <div key={a.id} className="rounded-xl border border-black/10 p-4 bg-black/2 relative">
                          {isAdmin && (
                            <button
                              onClick={() => removeBankAccount(a.id)}
                              className="absolute top-3 right-3 rounded-lg p-1 hover:bg-red-50"
                              title="Remove account"
                            >
                              <X className="h-3.5 w-3.5 text-red-500" />
                            </button>
                          )}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex rounded-full bg-[#002651] text-white text-[10px] font-bold px-2 py-0.5">{a.currency}</span>
                            <span className="text-sm font-bold text-black">{a.bank_name}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-black/60">
                            {a.iban && <span><span className="font-bold">IBAN:</span> {a.iban}</span>}
                            {a.account_number && <span><span className="font-bold">Acct:</span> {a.account_number}</span>}
                            {a.sort_code && <span><span className="font-bold">Sort:</span> {a.sort_code}</span>}
                            {a.bic && <span><span className="font-bold">BIC:</span> {a.bic}</span>}
                            {a.intermediary_bic && <span><span className="font-bold">Interm. BIC:</span> {a.intermediary_bic}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new account form */}
                  {isAdmin && (
                  <div className="rounded-xl border border-black/10 p-4 space-y-3">
                    <div className="text-xs font-bold text-black/50 uppercase tracking-wider flex items-center gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Add Account
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Currency *</label>
                        <select value={bankDraft.currency} onChange={(e) => setBankDraft((d) => ({ ...d, currency: e.target.value }))} className={inputCls}>
                          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Bank Name *</label>
                        <input value={bankDraft.bank_name} onChange={(e) => setBankDraft((d) => ({ ...d, bank_name: e.target.value }))} placeholder="e.g. Revolut Bank UAB" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>IBAN</label>
                        <input value={bankDraft.iban} onChange={(e) => setBankDraft((d) => ({ ...d, iban: e.target.value }))} placeholder="FR76 ..." className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Account Number</label>
                        <input value={bankDraft.account_number} onChange={(e) => setBankDraft((d) => ({ ...d, account_number: e.target.value }))} placeholder="Optional" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>Sort Code</label>
                        <input value={bankDraft.sort_code} onChange={(e) => setBankDraft((d) => ({ ...d, sort_code: e.target.value }))} placeholder="00-00-00" className={inputCls} />
                      </div>
                      <div>
                        <label className={labelCls}>BIC / SWIFT</label>
                        <input value={bankDraft.bic} onChange={(e) => setBankDraft((d) => ({ ...d, bic: e.target.value }))} placeholder="e.g. REVOFRP2" className={inputCls} />
                      </div>
                      <div className="col-span-2">
                        <label className={labelCls}>Intermediary BIC</label>
                        <input value={bankDraft.intermediary_bic} onChange={(e) => setBankDraft((d) => ({ ...d, intermediary_bic: e.target.value }))} placeholder="Optional" className={inputCls} />
                      </div>
                    </div>
                    <button
                      onClick={addBankAccount}
                      disabled={addingBank}
                      className="w-full rounded-xl bg-[#002651] text-white py-2 text-sm font-bold hover:opacity-95 disabled:opacity-60 transition"
                    >
                      {addingBank ? "Adding…" : "Add Account"}
                    </button>
                  </div>
                  )}
                </div>
          </div>
        </div>
      )}
    </div>
  );
}
