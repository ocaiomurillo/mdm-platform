"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

const ALL_COLUMNS = [
  { id: "mdm_partner_id", label: "ID MDM", accessor: (p: any) => p.mdmPartnerId ?? p.mdm_partner_id ?? "-" },
  { id: "sap_bp_id", label: "SAP BP", accessor: (p: any) => p.sapBusinessPartnerId ?? p.sap_bp_id ?? "-" },
  { id: "nome_legal", label: "Nome", accessor: (p: any) => p.nome_legal },
  { id: "documento", label: "Documento", accessor: (p: any) => p.documento },
  { id: "natureza", label: "Natureza", accessor: (p: any) => p.natureza },
  { id: "tipo_pessoa", label: "Tipo", accessor: (p: any) => p.tipo_pessoa },
  { id: "status", label: "Status", accessor: (p: any) => p.status },
  { id: "uf", label: "UF", accessor: (p: any) => {
      const addr = (p.addresses || []).find((a: any) => a.tipo === "fiscal") || p.addresses?.[0];
      return addr?.uf || "-";
    }
  },
  { id: "atualizado", label: "Atualizado em", accessor: (p: any) => p.updatedAt || p.updated_at || "-" }
] as const;

const STORAGE_KEY = "mdm-partners-columns";

function loadStoredColumns(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to parse stored columns", error);
  }
  return null;
}

export default function PartnersList() {
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [naturezaFilter, setNaturezaFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sapFilter, setSapFilter] = useState<string>("all");

  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => loadStoredColumns() || ["mdm_partner_id", "sap_bp_id", "nome_legal", "documento", "status"]);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedColumns));
    } catch (error) {
      console.warn("Failed to store columns", error);
    }
  }, [selectedColumns]);

  const fetchPartners = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (debouncedSearch) params.q = debouncedSearch;
      if (naturezaFilter !== "all") params.natureza = naturezaFilter;
      if (statusFilter !== "all") params.status = statusFilter;
      if (sapFilter !== "all") params.sap = sapFilter;

      const query = new URLSearchParams(params).toString();
      const url = `${process.env.NEXT_PUBLIC_API_URL}/partners/search${query ? `?${query}` : ""}`;
      const response = await axios.get(url);
      setPartners(response.data);
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setError(typeof message === "string" ? message : "Não foi possível carregar os parceiros.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, naturezaFilter, statusFilter, sapFilter]);

  useEffect(() => {
    fetchPartners();
  }, [fetchPartners]);

  const toggleColumn = (id: string) => {
    setSelectedColumns((current) => {
      if (current.includes(id)) {
        return current.filter((col) => col !== id);
      }
      return [...current, id];
    });
  };

  const columns = useMemo(() => ALL_COLUMNS.filter((column) => selectedColumns.includes(column.id)), [selectedColumns]);

  return (
    <main className="flex min-h-screen flex-col gap-4 p-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900">Parceiros</h1>
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, documento, ID SAP ou MDM"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm md:w-80"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowColumnPicker((value) => !value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
            >
              ⚙
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">
            Natureza:
            <select
              value={naturezaFilter}
              onChange={(event) => setNaturezaFilter(event.target.value)}
              className="rounded border border-zinc-200 px-2 py-1"
            >
              <option value="all">Todas</option>
              <option value="cliente">Cliente</option>
              <option value="fornecedor">Fornecedor</option>
              <option value="ambos">Ambos</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Status:
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded border border-zinc-200 px-2 py-1"
            >
              <option value="all">Todos</option>
              <option value="draft">Rascunho</option>
              <option value="em_validacao">Em validação</option>
              <option value="aprovado">Aprovado</option>
              <option value="rejeitado">Rejeitado</option>
              <option value="integrado">Integrado</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Origem SAP:
            <select
              value={sapFilter}
              onChange={(event) => setSapFilter(event.target.value)}
              className="rounded border border-zinc-200 px-2 py-1"
            >
              <option value="all">Todos</option>
              <option value="sim">Somente SAP</option>
              <option value="nao">Somente MDM</option>
            </select>
          </label>
        </div>
      </section>

      {showColumnPicker && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">Colunas da tabela</h2>
          <div className="mt-3 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {ALL_COLUMNS.map((column) => (
              <label key={column.id} className="flex items-center gap-2 text-sm text-zinc-600">
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(column.id)}
                  onChange={() => toggleColumn(column.id)}
                />
                {column.label}
              </label>
            ))}
          </div>
        </section>
      )}

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="flex-1 overflow-x-auto">
        <table className="min-w-full divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <thead className="bg-zinc-50">
            <tr>
              {columns.map((column) => (
                <th key={column.id} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  {column.label}
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Origem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-sm text-zinc-500">Carregando parceiros...</td>
              </tr>
            ) : partners.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-6 text-center text-sm text-zinc-500">Nenhum parceiro encontrado.</td>
              </tr>
            ) : (
              partners.map((partner) => (
                <tr key={partner.id} className="hover:bg-zinc-50">
                  {columns.map((column) => (
                    <td key={column.id} className="px-4 py-3 text-sm text-zinc-700">
                      {column.accessor(partner)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-xs">
                    {partner.sapBusinessPartnerId || partner.sap_bp_id ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">SAP</span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium text-zinc-600">MDM</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}