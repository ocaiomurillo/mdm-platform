"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import axios from "axios";
import { Eye, Link2, Loader2, Pencil, StickyNote } from "lucide-react";
import { useRouter } from "next/navigation";
import { PartnerApprovalStage } from "@mdm/types";
import { getStoredUser, StoredUser } from "../../../lib/auth";
import { mapSapSegments, summarizeSapOverall } from "./sap-integration-helpers";

const stageLabels: Record<PartnerApprovalStage, string> = {
  fiscal: "Fiscal",
  compras: "Compras/Vendas",
  dados_mestres: "Dados Mestres",
  finalizado: "Concluído"
};

const stagePermissions: Record<PartnerApprovalStage, string | null> = {
  fiscal: "partners.approval.fiscal",
  compras: "partners.approval.compras",
  dados_mestres: "partners.approval.dados_mestres",
  finalizado: null
};

const sapStatusToneClasses = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
  processing: "border-indigo-200 bg-indigo-50 text-indigo-700",
  pending: "border-zinc-200 bg-zinc-50 text-zinc-600"
} as const;

function renderSapStatus(partner: any) {
  const segments = mapSapSegments(partner.sap_segments ?? partner.sapSegments ?? []);
  const summary = summarizeSapOverall(segments);
  const toneClass = sapStatusToneClasses[summary.tone];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${toneClass}`}>
      {summary.label}
    </span>
  );
}

const hasRecentNotesFlag = (partner: any): boolean => {
  if (!partner) return false;
  if (typeof partner.recentNotesCount === "number") {
    return partner.recentNotesCount > 0;
  }
  if (typeof partner.recent_notes_count === "number") {
    return partner.recent_notes_count > 0;
  }
  if (typeof partner.hasRecentNotes === "boolean") {
    return partner.hasRecentNotes;
  }
  if (typeof partner.has_recent_notes === "boolean") {
    return partner.has_recent_notes;
  }
  return false;
};

function renderPartnerName(partner: any) {
  const hasRecentNotes = hasRecentNotesFlag(partner);
  return (
    <span className="flex items-center gap-2">
      <span>{partner.nome_legal}</span>
      {hasRecentNotes ? (
        <span
          className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700"
          title="Notas recentes cadastradas"
        >
          Notas
        </span>
      ) : null}
    </span>
  );
}

const ALL_COLUMNS = [
  { id: "mdm_partner_id", label: "ID MDM", accessor: (p: any) => p.mdmPartnerId ?? p.mdm_partner_id ?? "-" },
  { id: "sap_bp_id", label: "SAP BP", accessor: (p: any) => p.sapBusinessPartnerId ?? p.sap_bp_id ?? "-" },
  { id: "sap_status", label: "Integração SAP", accessor: renderSapStatus },
  { id: "nome_legal", label: "Nome", accessor: renderPartnerName },
  { id: "documento", label: "Documento", accessor: (p: any) => p.documento },
  { id: "natureza", label: "Natureza", accessor: (p: any) => p.natureza },
  { id: "tipo_pessoa", label: "Tipo", accessor: (p: any) => p.tipo_pessoa },
  { id: "status", label: "Status", accessor: (p: any) => p.status },
  {
    id: "approval_stage",
    label: "Etapa",
    accessor: (p: any) => stageLabels[(p.approvalStage || "fiscal") as PartnerApprovalStage] ?? "-"
  },
  { id: "uf", label: "UF", accessor: (p: any) => {
      const addr = (p.addresses || []).find((a: any) => a.tipo === "fiscal") || p.addresses?.[0];
      return addr?.uf || "-";
    }
  },
  { id: "atualizado", label: "Atualizado em", accessor: (p: any) => p.updatedAt || p.updated_at || "-" }
] as const;

const STORAGE_KEY = "mdm-partners-columns";

type ActionFeedback = { type: "success" | "error"; message: string };

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
  const router = useRouter();
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [actionLoadingPartnerId, setActionLoadingPartnerId] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<{ partnerId: string; partnerName: string } | null>(null);
  const [noteContent, setNoteContent] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const feedbackTimeoutRef = useRef<number | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [naturezaFilter, setNaturezaFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sapFilter, setSapFilter] = useState<string>("all");

  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>(() => {
    const stored = loadStoredColumns();
    const defaults = ["mdm_partner_id", "sap_bp_id", "sap_status", "nome_legal", "documento", "status", "approval_stage"];
    if (!stored) {
      return defaults;
    }
    if (!stored.includes("sap_status")) {
      return [...stored, "sap_status"];
    }
    return stored;
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  useEffect(() => {
    setCurrentUser(getStoredUser());
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) {
        window.clearTimeout(feedbackTimeoutRef.current);
      }
    };
  }, []);

  const showFeedback = useCallback((feedback: ActionFeedback | null) => {
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
    setActionFeedback(feedback);
    if (feedback) {
      feedbackTimeoutRef.current = window.setTimeout(() => {
        setActionFeedback(null);
        feedbackTimeoutRef.current = null;
      }, 4000);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedColumns));
    } catch (error) {
      console.warn("Failed to store columns", error);
    }
  }, [selectedColumns]);

  const fetchPartners = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const token = localStorage.getItem("mdmToken");
        if (!token) {
          router.replace("/login");
          if (!silent) {
            setLoading(false);
          }
          return;
        }

        const params: Record<string, string> = {};
        if (debouncedSearch) params.q = debouncedSearch;
        if (naturezaFilter !== "all") params.natureza = naturezaFilter;
        if (statusFilter !== "all") params.status = statusFilter;
        if (sapFilter !== "all") params.sap = sapFilter;

        const query = new URLSearchParams(params).toString();
        const url = `${process.env.NEXT_PUBLIC_API_URL}/partners/search${query ? `?${query}` : ""}`;
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setPartners(response.data);
      } catch (err: any) {
        if (err?.response?.status === 401) {
          localStorage.removeItem("mdmToken");
          router.replace("/login");
          return;
        }
        const message = err?.response?.data?.message;
        setError(typeof message === "string" ? message : "Não foi possível carregar os parceiros.");
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [debouncedSearch, naturezaFilter, router, sapFilter, statusFilter]
  );

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

  const handleViewDetails = (partner: any, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    router.push(`/partners/${partner.id}`);
  };

  const handleEditPartner = (partner: any, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    router.push(`/partners/change-request?partner=${partner.id}`);
  };

  const handleOpenNoteModal = (partner: any, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setNoteModal({ partnerId: partner.id, partnerName: partner.nome_legal });
    setNoteContent("");
    setNoteError(null);
  };

  const handleCloseNoteModal = () => {
    setNoteModal(null);
    setNoteContent("");
    setNoteError(null);
  };

  const handleLinkAudit = async (partner: any, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();

    if (!process.env.NEXT_PUBLIC_API_URL) {
      showFeedback({ type: "error", message: "URL da API não configurada." });
      return;
    }

    const token = localStorage.getItem("mdmToken");
    if (!token) {
      router.replace("/login");
      showFeedback({ type: "error", message: "Sessão expirada. Faça login novamente." });
      return;
    }

    setActionLoadingPartnerId(partner.id);
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/partners/${partner.id}/audit`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      showFeedback({ type: "success", message: `Auditoria vinculada para ${partner.nome_legal}.` });
    } catch (err: any) {
      const message = err?.response?.data?.message;
      showFeedback({
        type: "error",
        message: typeof message === "string" ? message : "Não foi possível vincular a auditoria."
      });
    } finally {
      setActionLoadingPartnerId(null);
    }
  };

  const handleSubmitNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!noteModal) return;

    const trimmed = noteContent.trim();
    if (!trimmed) {
      setNoteError("Informe o conteúdo da nota.");
      return;
    }

    if (!process.env.NEXT_PUBLIC_API_URL) {
      setNoteError("URL da API não configurada.");
      return;
    }

    const token = localStorage.getItem("mdmToken");
    if (!token) {
      router.replace("/login");
      setNoteError("Sessão expirada. Faça login novamente.");
      return;
    }

    const { partnerId, partnerName } = noteModal;

    setNoteSaving(true);
    setNoteError(null);
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/partners/${partnerId}/notes`,
        { content: trimmed },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      setPartners((current) =>
        current.map((item) => {
          if (item.id !== partnerId) return item;
          const currentCount =
            typeof item.recentNotesCount === "number"
              ? item.recentNotesCount
              : typeof item.recent_notes_count === "number"
              ? item.recent_notes_count
              : 0;
          return { ...item, recentNotesCount: currentCount + 1 };
        })
      );

      showFeedback({ type: "success", message: `Nota criada para ${partnerName}.` });
      handleCloseNoteModal();
      fetchPartners({ silent: true });
    } catch (err: any) {
      const message = err?.response?.data?.message;
      setNoteError(typeof message === "string" ? message : "Não foi possível criar a nota.");
    } finally {
      setNoteSaving(false);
    }
  };

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
      {actionFeedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            actionFeedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {actionFeedback.message}
        </div>
      )}

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
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-6 text-center text-sm text-zinc-500">Carregando parceiros...</td>
              </tr>
            ) : partners.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 2} className="px-4 py-6 text-center text-sm text-zinc-500">Nenhum parceiro encontrado.</td>
              </tr>
            ) : (
              partners.map((partner) => {
                const stage = (partner.approvalStage || "fiscal") as PartnerApprovalStage;
                const permission = stagePermissions[stage];
                const canAct =
                  partner.status === "em_validacao" &&
                  permission !== null &&
                  currentUser?.responsibilities?.includes(permission);
                return (
                  <tr
                    key={partner.id}
                    className={`transition-colors ${canAct ? "bg-indigo-50 hover:bg-indigo-100" : "hover:bg-zinc-50"}`}
                  >
                    {columns.map((column) => (
                      <td key={column.id} className="px-4 py-3 text-sm text-zinc-700">
                        {column.id === "approval_stage" && canAct ? (
                          <span className="inline-flex items-center gap-2">
                            <span>{column.accessor(partner)}</span>
                            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                              Você pode aprovar
                            </span>
                          </span>
                        ) : (
                          column.accessor(partner)
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-xs">
                      {partner.sapBusinessPartnerId || partner.sap_bp_id ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">SAP</span>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium text-zinc-600">MDM</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={(event) => handleViewDetails(partner, event)}
                          className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                          aria-label="Ver dados do parceiro"
                          title="Ver dados"
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Ver dados</span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => handleEditPartner(partner, event)}
                          className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                          aria-label="Editar parceiro"
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => handleOpenNoteModal(partner, event)}
                          className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                          aria-label="Criar nota"
                          title="Criar nota"
                        >
                          <StickyNote className="h-4 w-4" aria-hidden="true" />
                          <span className="sr-only">Criar nota</span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => handleLinkAudit(partner, event)}
                          className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-400"
                          aria-label={actionLoadingPartnerId === partner.id ? "Vinculando auditoria" : "Vincular auditoria"}
                          title="Vincular auditoria"
                          disabled={actionLoadingPartnerId === partner.id}
                          >
                          {actionLoadingPartnerId === partner.id ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                              <span className="sr-only">Vinculando auditoria</span>
                            </>
                          ) : (
                            <>
                              <Link2 className="h-4 w-4" aria-hidden="true" />
                              <span className="sr-only">Vincular auditoria</span>
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {noteModal && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">Nova nota para {noteModal.partnerName}</h2>
            <form onSubmit={handleSubmitNote} className="mt-4 flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm text-zinc-700">
                Conteúdo
                <textarea
                  value={noteContent}
                  onChange={(event) => setNoteContent(event.target.value)}
                  rows={5}
                  className="w-full resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                  placeholder="Escreva a nota"
                  autoFocus
                  disabled={noteSaving}
                />
              </label>
              {noteError && <p className="text-sm text-red-600">{noteError}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseNoteModal}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                  disabled={noteSaving}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={noteSaving}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-80"
                >
                  {noteSaving ? "Salvando..." : "Salvar nota"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}