"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { useProfile } from "../profile-context";
import { Pencil, Trash2, Plus, X, Users, Building2 } from "lucide-react";

type GroupEntity = {
  id: string;
  legal_name: string;
  entity_type: string;
  ssi: string | null;
  short_name: string | null;
};

type EntityContact = {
  id: string;
  group_entity_id: string;
  first_name: string;
  family_name: string;
  email: string | null;
  role: string | null;
};

function EntityTypeBadge({ type }: { type: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    valeur:    { label: "Valeur",     classes: "bg-blue-100 text-blue-800" },
    riverrock: { label: "RiverRock",  classes: "bg-teal-100 text-teal-800" },
    other:     { label: "Other",      classes: "bg-gray-100 text-gray-600" },
  };
  const { label, classes } = map[type] ?? map.other;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${classes}`}>
      {label}
    </span>
  );
}

export default function GroupEntitiesPage() {
  const isAdmin = useProfile()?.role === "admin";
  const [entities, setEntities] = useState<GroupEntity[]>([]);
  const [loading, setLoading] = useState(false);

  // edit entity
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<GroupEntity>>({});

  // add entity
  const [showAddForm, setShowAddForm] = useState(false);
  const [addDraft, setAddDraft] = useState<{ legal_name: string; ssi: string; short_name: string }>({ legal_name: "", ssi: "", short_name: "" });

  const addEntity = async () => {
    const payload = {
      legal_name: addDraft.legal_name.trim(),
      ssi: addDraft.ssi.trim() || null,
      short_name: addDraft.short_name.trim() || null,
      entity_type: "other",
    };
    if (!payload.legal_name) return alert("Legal Name is required.");
    const { error } = await supabase.from("group_entities").insert(payload);
    if (error) return alert(error.message);
    setShowAddForm(false);
    setAddDraft({ legal_name: "", ssi: "", short_name: "" });
    fetchEntities();
  };

  // contacts drawer
  const [openEntity, setOpenEntity] = useState<GroupEntity | null>(null);
  const [contacts, setContacts] = useState<EntityContact[]>([]);

  // add contact form
  const [contactFirst, setContactFirst] = useState("");
  const [contactFamily, setContactFamily] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactRole, setContactRole] = useState("");

  // edit contact
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactDraft, setContactDraft] = useState<Partial<EntityContact>>({});

  const fetchEntities = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("group_entities")
      .select("id, legal_name, entity_type, ssi, short_name")
      .order("legal_name");
    if (error) alert(error.message);
    setEntities((data ?? []) as GroupEntity[]);
    setLoading(false);
  };

  const fetchContacts = async (entityId: string) => {
    const { data, error } = await supabase
      .from("group_entity_contacts")
      .select("id, group_entity_id, first_name, family_name, email, role")
      .eq("group_entity_id", entityId)
      .order("family_name");
    if (error) alert(error.message);
    setContacts((data ?? []) as EntityContact[]);
  };

  useEffect(() => {
    fetchEntities();
  }, []);

  // ── Entity edit ───────────────────────────────────────────────────────────

  const startEdit = (e: GroupEntity) => {
    setEditingId(e.id);
    setDraft({ legal_name: e.legal_name, ssi: e.ssi ?? "", short_name: e.short_name ?? "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft({});
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const payload = {
      legal_name: (draft.legal_name ?? "").trim(),
      ssi: (draft.ssi ?? "").trim() || null,
      short_name: (draft.short_name ?? "").trim() || null,
    };
    if (!payload.legal_name) return alert("Legal Name is required.");
    const { error } = await supabase.from("group_entities").update(payload).eq("id", editingId);
    if (error) return alert(error.message);
    cancelEdit();
    fetchEntities();
    if (openEntity?.id === editingId) {
      setOpenEntity((prev) => prev ? { ...prev, ...payload } : prev);
    }
  };

  // ── Contacts drawer ───────────────────────────────────────────────────────

  const openContactsDrawer = async (e: GroupEntity) => {
    setOpenEntity(e);
    setContacts([]);
    setEditingContactId(null);
    setContactDraft({});
    setContactFirst("");
    setContactFamily("");
    setContactEmail("");
    setContactRole("");
    await fetchContacts(e.id);
  };

  const addContact = async () => {
    if (!openEntity) return;
    if (!contactFirst.trim() || !contactFamily.trim()) return;
    const payload = {
      group_entity_id: openEntity.id,
      first_name: contactFirst.trim(),
      family_name: contactFamily.trim(),
      email: contactEmail.trim() || null,
      role: contactRole.trim() || null,
    };
    const { error } = await supabase.from("group_entity_contacts").insert([payload]);
    if (error) return alert(error.message);
    setContactFirst("");
    setContactFamily("");
    setContactEmail("");
    setContactRole("");
    fetchContacts(openEntity.id);
  };

  const startContactEdit = (c: EntityContact) => {
    setEditingContactId(c.id);
    setContactDraft({
      first_name: c.first_name,
      family_name: c.family_name,
      email: c.email ?? "",
      role: c.role ?? "",
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
      role: (contactDraft.role ?? "").trim() || null,
    };
    if (!payload.first_name || !payload.family_name) {
      return alert("First name and family name are required.");
    }
    const { error } = await supabase
      .from("group_entity_contacts")
      .update(payload)
      .eq("id", editingContactId);
    if (error) return alert(error.message);
    cancelContactEdit();
    if (openEntity) fetchContacts(openEntity.id);
  };

  const deleteContact = async (id: string) => {
    if (!confirm("Delete this contact?")) return;
    const { error } = await supabase.from("group_entity_contacts").delete().eq("id", id);
    if (error) return alert(error.message);
    if (openEntity) fetchContacts(openEntity.id);
  };

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 bg-white hover:bg-black/5 active:scale-[0.98] transition";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-black flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[#002651]" />
            Group Entities
          </h1>
          <div className="text-sm text-black/60">Internal booking and distributing entities</div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => { setShowAddForm(true); setAddDraft({ legal_name: "", ssi: "", short_name: "" }); }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#002651] text-white px-4 py-2 text-sm font-bold hover:opacity-95"
            >
              <Plus className="h-4 w-4" /> Add Entity
            </button>
          )}
          <button
            onClick={fetchEntities}
            className="rounded-xl border border-black/20 px-4 py-2 text-sm font-bold hover:bg-black/5"
          >
            {loading ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-black/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left">
            <tr>
              <th className="p-3 font-semibold text-black/80">Legal Name</th>
              <th className="p-3 font-semibold text-black/80">Short Name</th>
              <th className="p-3 font-semibold text-black/80">SSI</th>
              <th className="p-3 w-44" />
            </tr>
          </thead>
          <tbody>
            {entities.map((e) => {
              const isEdit = editingId === e.id;
              return (
                <tr key={e.id} className="border-t border-black/10">
                  <td className="p-3">
                    {isEdit ? (
                      <input
                        value={(draft.legal_name as string) ?? ""}
                        onChange={(ev) => setDraft((d) => ({ ...d, legal_name: ev.target.value }))}
                        className="w-full rounded-lg border border-black/20 px-2 py-1 text-sm"
                      />
                    ) : (
                      <span className="font-semibold text-black">{e.legal_name}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEdit ? (
                      <input
                        value={(draft.short_name as string) ?? ""}
                        onChange={(ev) => setDraft((d) => ({ ...d, short_name: ev.target.value }))}
                        className="w-full rounded-lg border border-black/20 px-2 py-1 text-sm"
                        placeholder="e.g. VALEUR SECURITIES AG"
                      />
                    ) : (
                      <span className="text-black/70">{e.short_name ?? "-"}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEdit ? (
                      <input
                        value={(draft.ssi as string) ?? ""}
                        onChange={(ev) => setDraft((d) => ({ ...d, ssi: ev.target.value }))}
                        className="w-full rounded-lg border border-black/20 px-2 py-1 text-sm"
                        placeholder="e.g. Euroclear 41420"
                      />
                    ) : (
                      <span className="text-black/70 font-mono text-xs">{e.ssi ?? "-"}</span>
                    )}
                  </td>
                  <td className="p-3">
                    {isEdit ? (
                      <div className="flex justify-end gap-2">
                        {isAdmin && (
                          <button
                            onClick={saveEdit}
                            className="rounded-lg bg-[#002651] text-white px-3 py-1 text-sm hover:opacity-95"
                          >
                            Save
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={cancelEdit}
                            className="rounded-lg border border-black/20 px-3 py-1 text-sm hover:bg-black/5"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex justify-end items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openContactsDrawer(e)}
                          className={iconBtn}
                          title="Manage dealer contacts"
                          aria-label="Manage dealer contacts"
                        >
                          <Users className="h-4 w-4" />
                        </button>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => startEdit(e)}
                            className={iconBtn}
                            title="Edit"
                            aria-label="Edit entity"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {entities.length === 0 && !showAddForm && (
              <tr>
                <td colSpan={4} className="p-6 text-black/60">
                  {loading ? "Loading…" : "No entities found."}
                </td>
              </tr>
            )}
            {showAddForm && (
              <tr className="border-t border-black/10 bg-blue-50/40">
                <td className="p-3">
                  <input
                    autoFocus
                    value={addDraft.legal_name}
                    onChange={(e) => setAddDraft((d) => ({ ...d, legal_name: e.target.value }))}
                    placeholder="Legal Name *"
                    className="w-full rounded-lg border border-black/20 px-2 py-1 text-sm"
                  />
                </td>
                <td className="p-3">
                  <input
                    value={addDraft.short_name}
                    onChange={(e) => setAddDraft((d) => ({ ...d, short_name: e.target.value }))}
                    placeholder="e.g. VALEUR PARIS SAS"
                    className="w-full rounded-lg border border-black/20 px-2 py-1 text-sm"
                  />
                </td>
                <td className="p-3">
                  <input
                    value={addDraft.ssi}
                    onChange={(e) => setAddDraft((d) => ({ ...d, ssi: e.target.value }))}
                    placeholder="e.g. Euroclear 12345"
                    className="w-full rounded-lg border border-black/20 px-2 py-1 text-sm"
                  />
                </td>
                <td className="p-3">
                  <div className="flex justify-end gap-2">
                    {isAdmin && (
                      <button onClick={addEntity} className="rounded-lg bg-[#002651] text-white px-3 py-1 text-sm hover:opacity-95">Save</button>
                    )}
                    {isAdmin && (
                      <button onClick={() => setShowAddForm(false)} className="rounded-lg border border-black/20 px-3 py-1 text-sm hover:bg-black/5">Cancel</button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Contacts drawer */}
      {openEntity && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpenEntity(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl border-l border-black/10 flex flex-col">
            <div className="px-5 py-4 bg-[#002651] text-white flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">Dealer Contacts</div>
                <div className="text-xs text-white/80">{openEntity.legal_name}</div>
              </div>
              <button
                onClick={() => setOpenEntity(null)}
                className="rounded-lg bg-white/10 px-3 py-1 text-sm hover:bg-white/15 flex items-center gap-1"
              >
                <X className="h-4 w-4" /> Close
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Add contact form */}
              {isAdmin && <div className="rounded-2xl border border-black/10 p-4 space-y-3">
                <div className="text-sm font-semibold text-black/70 flex items-center gap-1">
                  <Plus className="h-4 w-4" /> Add Contact
                </div>
                <div className="grid grid-cols-2 gap-3">
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
                    className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold col-span-2"
                  />
                  <input
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    placeholder="Role (optional)"
                    className="rounded-xl border border-black/20 px-3 py-2 text-sm font-bold col-span-2"
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
              </div>}

              {/* Contacts list */}
              <div className="rounded-2xl border border-black/10 overflow-x-auto">
                <table className="min-w-[560px] w-full table-fixed text-sm font-bold">
                  <colgroup>
                    <col className="w-[110px]" />
                    <col className="w-[130px]" />
                    <col />
                    <col className="w-[100px]" />
                    <col className="w-[100px]" />
                  </colgroup>
                  <thead className="bg-black/5 text-left">
                    <tr>
                      <th className="p-3">First Name</th>
                      <th className="p-3">Family Name</th>
                      <th className="p-3">Email</th>
                      <th className="p-3">Role</th>
                      <th className="p-3" />
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
                                onChange={(ev) =>
                                  setContactDraft((d) => ({ ...d, first_name: ev.target.value }))
                                }
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
                                onChange={(ev) =>
                                  setContactDraft((d) => ({ ...d, family_name: ev.target.value }))
                                }
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
                                onChange={(ev) =>
                                  setContactDraft((d) => ({ ...d, email: ev.target.value }))
                                }
                                className="w-full rounded-lg border border-black/20 px-2 py-1"
                              />
                            ) : (
                              <div className="truncate" title={c.email ?? ""}>{c.email ?? "-"}</div>
                            )}
                          </td>
                          <td className="p-3">
                            {isEdit ? (
                              <input
                                value={(contactDraft.role as string) ?? ""}
                                onChange={(ev) =>
                                  setContactDraft((d) => ({ ...d, role: ev.target.value }))
                                }
                                className="w-full rounded-lg border border-black/20 px-2 py-1"
                              />
                            ) : (
                              <div className="truncate text-black/60" title={c.role ?? ""}>{c.role ?? "-"}</div>
                            )}
                          </td>
                          <td className="p-3">
                            {isEdit ? (
                              <div className="flex justify-end gap-2 whitespace-nowrap">
                                {isAdmin && (
                                  <button
                                    onClick={saveContactEdit}
                                    className="rounded-lg bg-[#002651] text-white px-3 py-1 text-sm hover:opacity-95"
                                  >
                                    Save
                                  </button>
                                )}
                                {isAdmin && (
                                  <button
                                    onClick={cancelContactEdit}
                                    className="rounded-lg border border-black/20 px-3 py-1 text-sm hover:bg-black/5"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div className="flex justify-end items-center gap-2 whitespace-nowrap">
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => startContactEdit(c)}
                                    className={iconBtn}
                                    title="Edit"
                                    aria-label="Edit contact"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </button>
                                )}
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => deleteContact(c.id)}
                                    className={iconBtn + " hover:bg-red-50"}
                                    title="Delete"
                                    aria-label="Delete contact"
                                  >
                                    <Trash2 className="h-4 w-4 text-red-600" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {contacts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-6 text-black/60">
                          No contacts yet. Add one above.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="text-xs text-black/60">
                Dealer contacts are shown on trade tickets for this entity.
                Contacts are deleted automatically if the entity is removed.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
