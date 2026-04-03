"use client";
export const dynamic = "force-dynamic";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/lib/supabase";
import { useProfile } from "../profile-context";
import {
  Pencil,
  Trash2,
  Archive,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

type Issuer = {
  id: string;
  legal_name: string;
};

type Product = {
  id: string;
  isin: string;
  valoren: string | null;
  product_name: string;
  currency: string;
  maturity_date: string | null;
  settlement: "percent" | "units";
  issue_price: number | null;
  archived: boolean;
  issuer: Issuer | null;
  issuer_id?: string;
};

type EditDraft = {
  product_name: string;
  issuer_id: string;
  currency: string;
  maturity_date: string;
  settlement: "percent" | "units";
  issue_price: string;
  valoren: string;
  archived: boolean;
};

const CURRENCIES = ["EUR", "USD", "AUD", "CAD", "CHF", "GBP", "HKD", "JPY", "NOK", "SEK"] as const;
type Currency = (typeof CURRENCIES)[number];

const normalizeCurrency = (v: string) => v.trim().toUpperCase();
const isAllowedCurrency = (v: string) =>
  (CURRENCIES as readonly string[]).includes(normalizeCurrency(v));

type SortKey = "issuer" | "currency" | "settlement" | null;
type SortDir = "asc" | "desc";

export default function ProductsPage() {
  const isAdmin = useProfile()?.role === "admin";
  const [products, setProducts] = useState<Product[]>([]);
  const [issuers, setIssuers] = useState<Issuer[]>([]);

  // create form
  const [isin, setIsin] = useState("");
  const [valoren, setValoren] = useState("");
  const [productName, setProductName] = useState("");
  const [issuerId, setIssuerId] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [maturityDate, setMaturityDate] = useState(""); // YYYY-MM-DD
  const [settlement, setSettlement] = useState<"percent" | "units">("percent");
  const [issuePrice, setIssuePrice] = useState<string>("");

  // list
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  // edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  // sorting (cosmetic, client-side)
  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();

    let base = products;
    if (!showArchived) base = base.filter((p) => !p.archived);

    if (!q) return base;

    return base.filter((p) => {
      const issuerName = p.issuer?.legal_name?.toLowerCase() ?? "";
      return (
        p.isin.toLowerCase().includes(q) ||
        (p.valoren ?? "").toLowerCase().includes(q) ||
        p.product_name.toLowerCase().includes(q) ||
        p.currency.toLowerCase().includes(q) ||
        issuerName.includes(q) ||
        (p.archived ? "archived" : "active").includes(q)
      );
    });
  }, [products, search, showArchived]);

  const sortedProducts = useMemo(() => {
    if (!sortKey) return filteredProducts;

    const dirMul = sortDir === "asc" ? 1 : -1;

    const getVal = (p: Product) => {
      if (sortKey === "issuer") return (p.issuer?.legal_name ?? "").toLowerCase();
      if (sortKey === "currency") return (p.currency ?? "").toLowerCase();
      if (sortKey === "settlement") return (p.settlement ?? "").toLowerCase();
      return "";
    };

    return [...filteredProducts].sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);
      if (av < bv) return -1 * dirMul;
      if (av > bv) return 1 * dirMul;
      return 0;
    });
  }, [filteredProducts, sortKey, sortDir]);

  const toggleSort = (key: Exclude<SortKey, null>) => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDir("asc");
        return key;
      }
      // same key => toggle direction
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

  const fetchIssuers = async () => {
    const { data, error } = await supabase
      .from("issuers")
      .select("id, legal_name")
      .order("legal_name");

    if (!error && data) {
      setIssuers(data as Issuer[]);
      if (!issuerId && data.length > 0) setIssuerId(data[0].id);
    }
  };

  const fetchProducts = async () => {
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, isin, valoren, product_name, currency, maturity_date, settlement, issue_price, archived, issuer_id, issuer:issuer_id(id, legal_name)"
      )
      .order("created_at", { ascending: false });

    if (!error && data) setProducts(data as unknown as Product[]);
  };

  const resetForm = () => {
    setIsin("");
    setValoren("");
    setProductName("");
    setCurrency("EUR");
    setMaturityDate("");
    setSettlement("percent");
    setIssuePrice("");
  };

  const addProduct = async () => {
    if (!isin || !productName || !issuerId || !currency) return;

    if (!isAllowedCurrency(currency)) {
      alert(`Currency must be one of: ${CURRENCIES.join(", ")}`);
      return;
    }

    const issuePriceNum =
      issuePrice.trim() === "" ? null : Number(issuePrice.trim());

    if (issuePriceNum !== null && Number.isNaN(issuePriceNum)) {
      alert("Issue price must be a number (or empty).");
      return;
    }

    const payload = {
      isin: isin.trim().toUpperCase(),
      valoren: valoren.trim() ? valoren.trim() : null,
      product_name: productName.trim(),
      issuer_id: issuerId,
      currency: normalizeCurrency(currency),
      maturity_date: maturityDate ? maturityDate : null,
      settlement,
      issue_price: issuePriceNum,
      archived: false,
    };

    const { error } = await supabase.from("products").insert([payload]);

    if (error) {
      alert(error.message);
      return;
    }

    resetForm();
    fetchProducts();
  };

  const deleteProduct = async (id: string) => {
    const ok = confirm(
      "Delete this product? This will fail if it is referenced by a trade. In production, prefer Archive."
    );
    if (!ok) return;

    const { error } = await supabase.from("products").delete().eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    if (editingId === id) {
      setEditingId(null);
      setDraft(null);
    }

    fetchProducts();
  };

  const startEdit = (p: Product) => {
    const issuer_id = (p as any).issuer_id as string | undefined;
    setEditingId(p.id);
    setDraft({
      product_name: p.product_name ?? "",
      issuer_id: issuer_id ?? issuers[0]?.id ?? "",
      currency: p.currency ?? "EUR",
      maturity_date: p.maturity_date ?? "",
      settlement: p.settlement ?? "percent",
      issue_price:
        p.issue_price === null || p.issue_price === undefined
          ? ""
          : String(p.issue_price),
      valoren: p.valoren ?? "",
      archived: !!p.archived,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const saveEdit = async () => {
    if (!editingId || !draft) return;

    if (!draft.product_name.trim()) {
      alert("Product name is required.");
      return;
    }
    if (!draft.issuer_id) {
      alert("Issuer is required.");
      return;
    }
    if (!draft.currency.trim()) {
      alert("Currency is required.");
      return;
    }
    if (!isAllowedCurrency(draft.currency)) {
      alert(`Currency must be one of: ${CURRENCIES.join(", ")}`);
      return;
    }

    const issuePriceNum =
      draft.issue_price.trim() === "" ? null : Number(draft.issue_price.trim());

    if (issuePriceNum !== null && Number.isNaN(issuePriceNum)) {
      alert("Issue price must be a number (or empty).");
      return;
    }

    const payload = {
      product_name: draft.product_name.trim(),
      issuer_id: draft.issuer_id,
      currency: normalizeCurrency(draft.currency),
      maturity_date: draft.maturity_date ? draft.maturity_date : null,
      settlement: draft.settlement,
      issue_price: issuePriceNum,
      valoren: draft.valoren.trim() ? draft.valoren.trim() : null,
      archived: draft.archived,
    };

    const { error } = await supabase.from("products").update(payload).eq("id", editingId);

    if (error) {
      alert(error.message);
      return;
    }

    setEditingId(null);
    setDraft(null);
    fetchProducts();
  };

  const toggleArchive = async (p: Product) => {
    const next = !p.archived;

    const ok = confirm(
      next
        ? "Archive this product? It will be hidden from default lists and booking dropdowns."
        : "Unarchive this product?"
    );
    if (!ok) return;

    const { error } = await supabase
      .from("products")
      .update({ archived: next })
      .eq("id", p.id);

    if (error) {
      alert(error.message);
      return;
    }

    if (editingId === p.id && draft) {
      setDraft({ ...draft, archived: next });
    }

    fetchProducts();
  };

  const iconBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/15 bg-white hover:bg-black/5 active:scale-[0.98] transition";

  useEffect(() => {
    fetchIssuers();
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-black">Products</h1>
          <div className="text-sm text-black/60">
            ISIN-based reference data used for trade autofill.
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-black/70 select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ISIN, issuer, product name…"
            className="w-full max-w-md rounded-xl border border-black/20 px-4 py-2"
          />
        </div>
      </div>

      {/* Create product */}
      {isAdmin && <div className="rounded-2xl border border-black/10 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-black mb-1">
              ISIN *
            </label>
            <input
              value={isin}
              onChange={(e) => setIsin(e.target.value)}
              placeholder="FR001400XXXX"
              className="w-full rounded-xl border border-black/20 px-4 py-2"
            />
            <div className="text-xs text-black/55 mt-1">
              ISIN is immutable once created (edit the product fields, not the identifier).
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">
              Valoren
            </label>
            <input
              value={valoren}
              onChange={(e) => setValoren(e.target.value)}
              placeholder="optional"
              className="w-full rounded-xl border border-black/20 px-4 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">
              Currency *
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-xl border border-black/20 px-4 py-2 bg-white"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-black mb-1">
              Product Name *
            </label>
            <input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Autocall on …"
              className="w-full rounded-xl border border-black/20 px-4 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">
              Issuer *
            </label>
            <select
              value={issuerId}
              onChange={(e) => setIssuerId(e.target.value)}
              className="w-full rounded-xl border border-black/20 px-4 py-2 bg-white"
            >
              {issuers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.legal_name}
                </option>
              ))}
            </select>
            {issuers.length === 0 && (
              <div className="text-xs text-black/60 mt-1">
                No issuers found — create an issuer first.
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">
              Maturity Date
            </label>
            <input
              type="date"
              value={maturityDate}
              onChange={(e) => setMaturityDate(e.target.value)}
              className="w-full rounded-xl border border-black/20 px-4 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">
              Settlement
            </label>
            <select
              value={settlement}
              onChange={(e) =>
                setSettlement(e.target.value as "percent" | "units")
              }
              className="w-full rounded-xl border border-black/20 px-4 py-2 bg-white"
            >
              <option value="percent">percent</option>
              <option value="units">units</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-black mb-1">
              Issue Price
            </label>
            <input
              value={issuePrice}
              onChange={(e) => setIssuePrice(e.target.value)}
              placeholder="100"
              className="w-full rounded-xl border border-black/20 px-4 py-2"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={addProduct}
            disabled={issuers.length === 0}
            className="rounded-xl bg-[#002651] text-white px-5 py-2.5 font-medium disabled:opacity-60"
          >
            Add product
          </button>

          <button
            onClick={resetForm}
            className="rounded-xl border border-black/20 px-5 py-2.5 font-medium hover:bg-black/5"
          >
            Reset
          </button>

          <button
            onClick={fetchProducts}
            className="rounded-xl border border-black/20 px-5 py-2.5 font-medium hover:bg-black/5"
          >
            Refresh
          </button>
        </div>
      </div>}

      {/* List */}
      <div className="rounded-2xl border border-black/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/5 text-left">
            <tr>
              <th className="p-3">ISIN</th>
              <th className="p-3">Valoren</th>
              <th className="p-3">Product Name</th>

              <th className="p-3">
                <button
                  type="button"
                  onClick={() => toggleSort("issuer")}
                  className="inline-flex items-center gap-2 font-semibold text-black/80 hover:text-black"
                  title="Sort by Issuer"
                >
                  Issuer <SortIcon k="issuer" />
                </button>
              </th>

              <th className="p-3">
                <button
                  type="button"
                  onClick={() => toggleSort("currency")}
                  className="inline-flex items-center gap-2 font-semibold text-black/80 hover:text-black"
                  title="Sort by CCY"
                >
                  CCY <SortIcon k="currency" />
                </button>
              </th>

              <th className="p-3">Maturity</th>

              <th className="p-3">
                <button
                  type="button"
                  onClick={() => toggleSort("settlement")}
                  className="inline-flex items-center gap-2 font-semibold text-black/80 hover:text-black"
                  title="Sort by Settlement"
                >
                  Settle <SortIcon k="settlement" />
                </button>
              </th>

              <th className="p-3">Issue Px</th>
              <th className="p-3">Status</th>
              <th className="p-3 w-48">Actions</th>
            </tr>
          </thead>

          <tbody>
            {sortedProducts.map((p) => {
              const isEditing = editingId === p.id;

              const statusPill = p.archived ? (
                <span className="inline-flex rounded-full px-2 py-0.5 text-xs border border-black/20 text-black/70">
                  Archived
                </span>
              ) : (
                <span className="inline-flex rounded-full px-2 py-0.5 text-xs bg-[#002651]/10 text-[#002651] border border-[#002651]/20">
                  Active
                </span>
              );

const settlementBadge = (() => {
  const isPercent = p.settlement === "percent";
  return (
    <span
      className={
        "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs border " +
        (isPercent
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-gray-100 text-gray-700 border-gray-200")
      }
    >
      <span
        className={
          "h-2 w-2 rounded-full " + (isPercent ? "bg-blue-500" : "bg-gray-500")
        }
      />
      {p.settlement}
    </span>
  );
})();

              return (
                <tr key={p.id} className="border-t border-black/10 align-top">
                  <td className="p-3 font-mono">{p.isin}</td>

                  <td className="p-3">
                    {isEditing ? (
                      <input
                        value={draft?.valoren ?? ""}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, valoren: e.target.value } : d))
                        }
                        className="w-32 rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : (
                      p.valoren ?? "-"
                    )}
                  </td>

                  <td className="p-3">
                    {isEditing ? (
                      <input
                        value={draft?.product_name ?? ""}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, product_name: e.target.value } : d))
                        }
                        className="w-full rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : (
                      <span className="font-semibold text-black">{p.product_name}</span>
                    )}
                  </td>

                  <td className="p-3">
                    {isEditing ? (
                      <select
                        value={draft?.issuer_id ?? ""}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, issuer_id: e.target.value } : d))
                        }
                        className="w-full rounded-lg border border-black/20 px-2 py-1 bg-white"
                      >
                        {issuers.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.legal_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-semibold text-black">
                        {p.issuer?.legal_name ?? "-"}
                      </span>
                    )}
                  </td>

                  <td className="p-3">
                    {isEditing ? (
                      <select
                        value={normalizeCurrency(draft?.currency ?? "EUR")}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, currency: e.target.value } : d))
                        }
                        className="w-24 rounded-lg border border-black/20 px-2 py-1 bg-white"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="font-mono">{p.currency}</span>
                    )}
                  </td>

                  <td className="p-3">
                    {isEditing ? (
                      <input
                        type="date"
                        value={draft?.maturity_date ?? ""}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, maturity_date: e.target.value } : d))
                        }
                        className="rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : (
                      p.maturity_date ?? "-"
                    )}
                  </td>

                  <td className="p-3">
                    {isEditing ? (
                      <select
                        value={draft?.settlement ?? "percent"}
                        onChange={(e) =>
                          setDraft((d) =>
                            d
                              ? { ...d, settlement: e.target.value as "percent" | "units" }
                              : d
                          )
                        }
                        className="rounded-lg border border-black/20 px-2 py-1 bg-white"
                      >
                        <option value="percent">percent</option>
                        <option value="units">units</option>
                      </select>
                    ) : (
                      settlementBadge
                    )}
                  </td>

                  <td className="p-3">
                    {isEditing ? (
                      <input
                        value={draft?.issue_price ?? ""}
                        onChange={(e) =>
                          setDraft((d) => (d ? { ...d, issue_price: e.target.value } : d))
                        }
                        className="w-24 rounded-lg border border-black/20 px-2 py-1"
                      />
                    ) : p.issue_price === null || p.issue_price === undefined ? (
                      "-"
                    ) : (
                      String(p.issue_price)
                    )}
                  </td>

                  <td className="p-3">{statusPill}</td>

                  <td className="p-3">
                    {isAdmin && (isEditing ? (
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
                          onClick={() => startEdit(p)}
                          className={iconBtn}
                          title="Edit"
                          aria-label="Edit product"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleArchive(p)}
                          className={iconBtn}
                          title={p.archived ? "Unarchive" : "Archive"}
                          aria-label={p.archived ? "Unarchive product" : "Archive product"}
                        >
                          {p.archived ? (
                            <RotateCcw className="h-4 w-4" />
                          ) : (
                            <Archive className="h-4 w-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteProduct(p.id)}
                          className={iconBtn + " hover:bg-red-50"}
                          title="Delete"
                          aria-label="Delete product"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </button>
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}

            {sortedProducts.length === 0 && (
              <tr>
                <td className="p-4 text-black/60" colSpan={10}>
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}