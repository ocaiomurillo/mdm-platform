"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import axios from "axios";
import type {
  Partner,
  PartnerApprovalHistoryEntry,
  PartnerApprovalStage,
  PartnerAuditLog,
  PartnerAuditDifference,
  SapIntegrationSegmentState
} from "@mdm/types";
import { ChangeRequestPayload } from "@mdm/types";
import { mapSapSegments, SAP_SEGMENT_LABELS, SAP_STATUS_LABELS, summarizeSapOverall, shouldAllowSapRetry, SapOverallTone } from "../sap-integration-helpers";
import { getStoredUser, storeUser, StoredUser } from "../../../../lib/auth";

type ChangeRequestItem = {
  id: string;
  partnerId: string;
  requestType: "individual" | "massa" | "auditoria";
  status: string;
  motivo?: string;
  requestedBy?: string;
  payload?: ChangeRequestPayload;
  createdAt: string;
};

const statusLabels: Record<string, string> = {
  pendente: "Pendente",
  aprovada: "Aprovada",
  rejeitada: "Rejeitada"
};

const typeLabels: Record<string, string> = {
  individual: "Individual",
  massa: "Em massa",
  auditoria: "Auditoria"
};

const workflowStages: PartnerApprovalStage[] = ["fiscal", "compras", "dados_mestres"];

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

const stageResponsibles: Record<PartnerApprovalStage, string> = {
  fiscal: "Equipe Fiscal",
  compras: "Compras/Vendas",
  dados_mestres: "Dados Mestres",
  finalizado: "MDM"
};

const stageEndpoints: Record<PartnerApprovalStage, string | null> = {
  fiscal: "fiscal",
  compras: "compras",
  dados_mestres: "dados-mestres",
  finalizado: null
};

const actionLabels: Record<PartnerApprovalHistoryEntry["action"], string> = {
  submitted: "Enviado",
  approved: "Aprovado",
  rejected: "Rejeitado"
};

const auditResultLabels: Record<PartnerAuditLog["result"], string> = {
  ok: "Sem divergências",
  inconsistente: "Inconsistências",
  erro: "Erro"
};

const auditResultStyles: Record<PartnerAuditLog["result"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  inconsistente: "border-amber-200 bg-amber-50 text-amber-700",
  erro: "border-red-200 bg-red-50 text-red-700"
};

const auditSourceLabels: Record<PartnerAuditDifference["source"], string> = {
  external: "Fonte externa",
  change_request: "Solicitação"
};

const auditScopeLabels: Record<string, string> = {
  individual: "Individual",
  massa: "Em massa"
};

const renderDiffValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return <span className="text-xs text-zinc-500">—</span>;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.length) {
      return <span className="text-xs text-zinc-500">—</span>;
    }
    return <span className="text-sm text-zinc-700">{trimmed}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="text-sm text-zinc-700">{String(value)}</span>;
  }
  return (
    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 text-xs text-zinc-600">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
};

type StageStatus = {
  stage: PartnerApprovalStage;
  state: "pending" | "current" | "complete" | "rejected";
};

const stageStateLabels: Record<StageStatus["state"], string> = {
  pending: "Pendente",
  current: "Em andamento",
  complete: "Concluída",
  rejected: "Rejeitada"
};

const stageStateStyles: Record<StageStatus["state"], string> = {
  pending: "border-zinc-200 bg-white text-zinc-600",
  current: "border-indigo-200 bg-indigo-50 text-indigo-700",
  complete: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700"
};

const sapSegmentStatusStyles: Record<SapIntegrationSegmentState["status"], string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
  processing: "border-indigo-200 bg-indigo-50 text-indigo-700",
  pending: "border-zinc-200 bg-white text-zinc-600"
};

const sapOverallToneStyles: Record<SapOverallTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
  processing: "border-indigo-200 bg-indigo-50 text-indigo-700",
  pending: "border-zinc-200 bg-zinc-50 text-zinc-600"
};

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
};

export default function PartnerDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const partnerId = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partner, setPartner] = useState<Partner | null>(null);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<PartnerAuditLog[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [tab, setTab] = useState<"dados" | "solicitacoes" | "auditorias">("dados");
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [sapActionLoading, setSapActionLoading] = useState(false);
  const [sapActionError, setSapActionError] = useState<string | null>(null);
  const [sapActionSuccess, setSapActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!partnerId) return;
    const fetchPartner = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem("mdmToken");
        if (!token) {
          router.replace("/login");
          return;
        }
        const url = `${process.env.NEXT_PUBLIC_API_URL}/partners/${partnerId}/details`;
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const details = response.data ?? {};
        setPartner(details?.partner ?? null);
        if (Array.isArray(details?.auditLogs)) {
          setAuditLogs(details.auditLogs as PartnerAuditLog[]);
        } else {
          setAuditLogs([]);
        }
      } catch (error: any) {
        if (error?.response?.status === 401) {
          localStorage.removeItem("mdmToken");
          router.replace("/login");
          return;
        }
        const message = error?.response?.data?.message;
        setError(typeof message === "string" ? message : "Não foi possível carregar o parceiro.");
        setAuditLogs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchPartner();
  }, [partnerId, router]);

  useEffect(() => {
    if (!partnerId) return;
    const fetchRequests = async () => {
      setRequestsLoading(true);
      setRequestsError(null);
      try {
        const token = localStorage.getItem("mdmToken");
        if (!token) {
          router.replace("/login");
          return;
        }
        const url = `${process.env.NEXT_PUBLIC_API_URL}/partners/${partnerId}/change-requests?page=1&pageSize=10`;
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setChangeRequests(Array.isArray(response.data?.items) ? response.data.items : []);
      } catch (error: any) {
        if (error?.response?.status === 401) {
          localStorage.removeItem("mdmToken");
          router.replace("/login");
          return;
        }
        const message = error?.response?.data?.message;
        setRequestsError(typeof message === "string" ? message : "Não foi possível carregar as solicitações.");
      } finally {
        setRequestsLoading(false);
      }
    };
    fetchRequests();
  }, [partnerId, router]);

  useEffect(() => {
    setCurrentUser(getStoredUser());
  }, []);

  const sapSegments = useMemo<SapIntegrationSegmentState[]>(() => {
    if (!partner) return [];
    return mapSapSegments(partner.sap_segments ?? []);
  }, [partner]);

  const sapOverall = useMemo(() => summarizeSapOverall(sapSegments), [sapSegments]);

  const canRetrySapIntegration = useMemo(() => {
    if (!partner) return false;
    if ((partner.approvalStage || "") !== "finalizado") return false;
    return shouldAllowSapRetry(sapSegments);
  }, [partner, sapSegments]);

  const selectedPartnerSummary = useMemo(() => {
    if (!partner) return [] as Array<{ label: string; value: string }>;
    return [
      { label: "Nome legal", value: partner.nome_legal },
      { label: "Nome fantasia", value: partner.nome_fantasia || "-" },
      { label: "Documento", value: partner.documento },
      { label: "Natureza", value: partner.natureza },
      { label: "Status", value: partner.status },
      {
        label: "Etapa atual",
        value: stageLabels[(partner.approvalStage || "fiscal") as PartnerApprovalStage] ?? "Fiscal"
      }
    ];
  }, [partner]);

  const stageStatuses = useMemo<StageStatus[]>(() => {
    if (!partner) return [];
    const currentStage = (partner.approvalStage || "fiscal") as PartnerApprovalStage;
    const currentIndex =
      currentStage === "finalizado"
        ? workflowStages.length
        : Math.max(workflowStages.indexOf(currentStage), 0);
    return workflowStages.map((stage, index) => {
      const entries = (partner.approvalHistory || []).filter((entry) => entry.stage === stage);
      const lastAction = entries[entries.length - 1]?.action;
      if (partner.status === "rejeitado" && currentStage === stage) {
        return { stage, state: "rejected" } as StageStatus;
      }
      if (lastAction === "rejected") {
        return { stage, state: "rejected" } as StageStatus;
      }
      if (currentStage === stage && partner.status === "em_validacao") {
        return { stage, state: "current" } as StageStatus;
      }
      if (index < currentIndex || lastAction === "approved" || partner.status === "aprovado") {
        return { stage, state: "complete" } as StageStatus;
      }
      return { stage, state: "pending" } as StageStatus;
    });
  }, [partner]);

  const pendingStages = useMemo(
    () => stageStatuses.filter((item) => item.state === "current" || item.state === "pending"),
    [stageStatuses]
  );

  const currentStage = (partner?.approvalStage || "fiscal") as PartnerApprovalStage;
  const currentStagePermission = stagePermissions[currentStage];
  const canSubmit = partner ? ["draft", "rejeitado"].includes(partner.status) : false;
  const canApprove = Boolean(
    partner &&
      partner.status === "em_validacao" &&
      currentStage !== "finalizado" &&
      currentStagePermission &&
      currentUser?.responsibilities?.includes(currentStagePermission)
  );
  const canReject = canApprove;

  const pendingDescription = useMemo(() => {
    if (!partner) return "";
    if (partner.status === "aprovado" || partner.approvalStage === "finalizado") {
      return "Fluxo concluído.";
    }
    if (partner.status === "rejeitado") {
      return `Fluxo interrompido na etapa ${stageLabels[currentStage]} (${stageResponsibles[currentStage]}).`;
    }
    if (!pendingStages.length) {
      return partner.status === "em_validacao"
        ? "Aguardando próxima aprovação."
        : "Envie o parceiro para validação para iniciar o fluxo.";
    }
    const descriptions = pendingStages.map(
      (item) => `${stageLabels[item.stage]} (${stageResponsibles[item.stage]})`
    );
    return `Faltam aprovações: ${descriptions.join(", ")}.`;
  }, [currentStage, partner, pendingStages]);

  const sortedHistory = useMemo(() => {
    if (!partner?.approvalHistory) return [] as PartnerApprovalHistoryEntry[];
    return [...partner.approvalHistory].sort(
      (a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime()
    );
  }, [partner]);

  const handleSubmitPartner = async () => {
    if (!partnerId || !process.env.NEXT_PUBLIC_API_URL) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const token = localStorage.getItem("mdmToken");
      if (!token) {
        router.replace("/login");
        return;
      }
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/partners/${partnerId}/submit`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = response.data?.partner ?? response.data;
      if (updated) {
        setPartner(updated);
      }
      setActionSuccess("Fluxo enviado para validação.");
    } catch (err: any) {
      if (err?.response?.status === 401) {
        localStorage.removeItem("mdmToken");
        storeUser(null);
        router.replace("/login");
        return;
      }
      const message = err?.response?.data?.message;
      setActionError(typeof message === "string" ? message : "Não foi possível enviar para validação.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetrySapIntegration = async () => {
    if (!partnerId || !process.env.NEXT_PUBLIC_API_URL) return;
    setSapActionLoading(true);
    setSapActionError(null);
    setSapActionSuccess(null);
    try {
      const token = localStorage.getItem("mdmToken");
      if (!token) {
        router.replace("/login");
        return;
      }
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/partners/${partnerId}/integrations/sap/retry`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = response.data?.partner ?? response.data;
      if (updated) {
        setPartner(updated);
      }
      setSapActionSuccess("Integração reenviada ao SAP.");
    } catch (err: any) {
      if (err?.response?.status === 401) {
        localStorage.removeItem("mdmToken");
        storeUser(null);
        router.replace("/login");
        return;
      }
      const message = err?.response?.data?.message;
      setSapActionError(typeof message === "string" ? message : "Não foi possível reenviar ao SAP.");
    } finally {
      setSapActionLoading(false);
    }
  };

  const handleApproveStage = async () => {
    if (!partnerId || !process.env.NEXT_PUBLIC_API_URL || !partner) return;
    const segment = stageEndpoints[currentStage];
    if (!segment) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const token = localStorage.getItem("mdmToken");
      if (!token) {
        router.replace("/login");
        return;
      }
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/partners/${partnerId}/${segment}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = response.data?.partner ?? response.data;
      if (updated) {
        setPartner(updated);
      }
      setActionSuccess("Etapa aprovada.");
    } catch (err: any) {
      if (err?.response?.status === 401) {
        localStorage.removeItem("mdmToken");
        storeUser(null);
        router.replace("/login");
        return;
      }
      const message = err?.response?.data?.message;
      setActionError(typeof message === "string" ? message : "Não foi possível aprovar a etapa.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectStage = async () => {
    if (!partnerId || !process.env.NEXT_PUBLIC_API_URL || !partner) return;
    const segment = stageEndpoints[currentStage];
    if (!segment) return;
    const reason = window.prompt("Informe o motivo da rejeição (opcional)")?.trim();
    if (reason === undefined) {
      return;
    }
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const token = localStorage.getItem("mdmToken");
      if (!token) {
        router.replace("/login");
        return;
      }
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/partners/${partnerId}/${segment}/reject`,
        reason ? { motivo: reason } : {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const updated = response.data?.partner ?? response.data;
      if (updated) {
        setPartner(updated);
      }
      setActionSuccess("Etapa rejeitada.");
    } catch (err: any) {
      if (err?.response?.status === 401) {
        localStorage.removeItem("mdmToken");
        storeUser(null);
        router.replace("/login");
        return;
      }
      const message = err?.response?.data?.message;
      setActionError(typeof message === "string" ? message : "Não foi possível rejeitar a etapa.");
    } finally {
      setActionLoading(false);
    }
  };

  if (!partnerId) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-sm text-zinc-600">
        ID do parceiro não informado.
      </main>
    );
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-sm text-zinc-500">Carregando parceiro...</main>;
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div>
      </main>
    );
  }

  if (!partner) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-sm text-zinc-500">
        Parceiro não encontrado.
      </main>
    );
  }

  const solicitacoesAtivas = changeRequests;

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-zinc-100 p-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={() => router.back()}
          className="self-start text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900"
        >
          Voltar
        </button>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{partner.nome_legal}</h1>
            <p className="text-sm text-zinc-500">Documento: {partner.documento}</p>
          </div>
          <Link
            href={`/partners/change-request?partner=${partnerId}`}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Solicitar alteração
          </Link>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-zinc-600">
          <span className="rounded-full bg-zinc-100 px-3 py-1">Natureza: {partner.natureza}</span>
          <span className="rounded-full bg-zinc-100 px-3 py-1">Status: {partner.status}</span>
          <span className={`rounded-full border px-3 py-1 font-medium ${sapOverallToneStyles[sapOverall.tone]}`}>
            SAP: {sapOverall.label}
          </span>
          {partner.sapBusinessPartnerId && (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">SAP BP {partner.sapBusinessPartnerId}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={() => setTab("dados")}
          className={`rounded-lg px-3 py-2 font-medium transition-colors ${
            tab === "dados" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Dados
        </button>
        <button
          type="button"
          onClick={() => setTab("solicitacoes")}
          className={`rounded-lg px-3 py-2 font-medium transition-colors ${
            tab === "solicitacoes" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Solicitações
        </button>
        <button
          type="button"
          onClick={() => setTab("auditorias")}
          className={`rounded-lg px-3 py-2 font-medium transition-colors ${
            tab === "auditorias" ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Auditorias
        </button>
      </div>

      {tab === "dados" && (
        <>
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Fluxo de aprovação</h2>
            <div className="mt-4 flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-3">
                  {stageStatuses.map(({ stage, state }) => (
                    <div
                      key={stage}
                      className={`min-w-[180px] rounded-xl border px-4 py-3 text-sm ${stageStateStyles[state]}`}
                    >
                      <div className="font-semibold">{stageLabels[stage]}</div>
                      <div className="text-xs">{stageResponsibles[stage]}</div>
                      <div className="text-xs font-medium uppercase tracking-wide">{stageStateLabels[state]}</div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-zinc-600">{pendingDescription}</p>
                {canApprove && (
                  <p className="text-xs font-medium text-indigo-600">
                    Você pode aprovar a etapa {stageLabels[currentStage]} neste momento.
                  </p>
                )}
              </div>
              {actionError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>
              )}
              {actionSuccess && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {actionSuccess}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {canSubmit && (
                  <button
                    type="button"
                    onClick={handleSubmitPartner}
                    disabled={actionLoading}
                    className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                  >
                    {actionLoading ? "Processando..." : "Enviar para validação"}
                  </button>
                )}
                {canApprove && (
                  <button
                    type="button"
                    onClick={handleApproveStage}
                    disabled={actionLoading}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 transition-opacity disabled:opacity-60"
                  >
                    {actionLoading ? "Processando..." : "Aprovar etapa"}
                  </button>
                )}
                {canReject && (
                  <button
                    type="button"
                    onClick={handleRejectStage}
                    disabled={actionLoading}
                    className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-opacity disabled:opacity-60"
                  >
                    {actionLoading ? "Processando..." : "Rejeitar etapa"}
                  </button>
                )}
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Histórico de etapas</h3>
                {sortedHistory.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">Nenhum evento registrado até o momento.</p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="min-w-full divide-y divide-zinc-200 text-sm">
                      <thead className="bg-zinc-50">
                        <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          <th className="px-4 py-2">Etapa</th>
                          <th className="px-4 py-2">Ação</th>
                          <th className="px-4 py-2">Responsável</th>
                          <th className="px-4 py-2">Data</th>
                          <th className="px-4 py-2">Observação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {sortedHistory.map((entry, index) => (
                          <tr key={`${entry.stage}-${entry.performedAt}-${index}`} className="bg-white">
                            <td className="px-4 py-2 text-sm text-zinc-700">{stageLabels[entry.stage]}</td>
                            <td className="px-4 py-2 text-sm text-zinc-700">{actionLabels[entry.action]}</td>
                            <td className="px-4 py-2 text-sm text-zinc-700">{entry.performedByName || entry.performedBy || "-"}</td>
                            <td className="px-4 py-2 text-xs text-zinc-500">{formatDateTime(entry.performedAt)}</td>
                            <td className="px-4 py-2 text-sm text-zinc-700">{entry.notes || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </section>



          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Integração SAP</h2>
                <p className="text-xs text-zinc-500">{sapOverall.description}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${sapOverallToneStyles[sapOverall.tone]}`}>
                {sapOverall.label}
              </span>
            </div>
            {sapActionError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{sapActionError}</div>
            )}
            {sapActionSuccess && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {sapActionSuccess}
              </div>
            )}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {sapSegments.map((segment) => (
                <div key={segment.segment} className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-zinc-800">
                      {SAP_SEGMENT_LABELS[segment.segment as keyof typeof SAP_SEGMENT_LABELS] ?? segment.segment}
                    </span>
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${sapSegmentStatusStyles[segment.status]}`}>
                      {SAP_STATUS_LABELS[segment.status] ?? segment.status}
                    </span>
                  </div>
                  <dl className="space-y-1 text-xs text-zinc-600">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="font-medium text-zinc-500">Última tentativa</dt>
                      <dd>{segment.lastAttemptAt ? formatDateTime(segment.lastAttemptAt) : "-"}</dd>
                    </div>
                    {segment.lastSuccessAt && (
                      <div className="flex items-center justify-between gap-2">
                        <dt className="font-medium text-zinc-500">Último sucesso</dt>
                        <dd>{formatDateTime(segment.lastSuccessAt)}</dd>
                      </div>
                    )}
                  </dl>
                  {segment.sapId && (
                    <p className="text-xs text-zinc-500">
                      SAP ID: <span className="font-medium text-zinc-700">{segment.sapId}</span>
                    </p>
                  )}
                  {segment.errorMessage ? (
                    <p className="text-xs text-red-600">{segment.errorMessage}</p>
                  ) : segment.message ? (
                    <p className="text-xs text-zinc-600">{segment.message}</p>
                  ) : null}
                </div>
              ))}
            </div>
            {canRetrySapIntegration && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleRetrySapIntegration}
                  disabled={sapActionLoading}
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-opacity disabled:opacity-60"
                >
                  {sapActionLoading ? "Reprocessando..." : "Reprocessar integração"}
                </button>
                <p className="text-xs text-zinc-500">Tente novamente após ajustar eventuais pendências.</p>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Resumo cadastral</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {selectedPartnerSummary.map((item) => (
                <div key={item.label} className="flex flex-col">
                  <span className="text-xs font-medium uppercase text-zinc-500">{item.label}</span>
                  <span className="text-sm text-zinc-800">{item.value}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === "solicitacoes" && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Solicitações de alteração</h2>
            <p className="text-xs text-zinc-500">Últimas 10 entradas</p>
          </div>
          {requestsError && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{requestsError}</div>}
          {requestsLoading ? (
            <p className="mt-4 text-sm text-zinc-500">Carregando solicitações...</p>
          ) : solicitacoesAtivas.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">Nenhuma solicitação registrada para este parceiro.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50">
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    <th className="px-4 py-2">ID</th>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Motivo</th>
                    <th className="px-4 py-2">Criado em</th>
                    <th className="px-4 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {solicitacoesAtivas.map((item) => (
                    <tr key={item.id} className="bg-white">
                      <td className="px-4 py-2 text-xs text-zinc-500">{item.id}</td>
                      <td className="px-4 py-2 text-sm text-zinc-800">{typeLabels[item.requestType] ?? item.requestType}</td>
                      <td className="px-4 py-2 text-sm text-zinc-800">{statusLabels[item.status] ?? item.status}</td>
                      <td className="px-4 py-2 text-sm text-zinc-700">{item.motivo || "-"}</td>
                      <td className="px-4 py-2 text-xs text-zinc-500">{formatDateTime(item.createdAt)}</td>
                      <td className="px-4 py-2 text-xs">
                        <Link
                          href={`/partners/change-request?partner=${partnerId}`}
                          className="font-medium text-zinc-600 transition-colors hover:text-zinc-900"
                        >
                          Revisar no wizard
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "auditorias" && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Auditorias</h2>
            <p className="text-xs text-zinc-500">
              {auditLogs.length === 0
                ? "Sem auditorias registradas"
                : `${auditLogs.length} ${auditLogs.length === 1 ? "auditoria" : "auditorias"} registradas`}
            </p>
          </div>
          {auditLogs.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">Nenhuma auditoria registrada para este parceiro.</p>
          ) : (
            <div className="mt-4 flex flex-col gap-4">
              {auditLogs.map((log) => (
                <article key={log.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-zinc-800">
                        {formatDateTime(log.createdAt)} • {auditResultLabels[log.result]}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {log.job?.id ? `Job ${log.job.id}` : "Auditoria registrada"}
                        {log.job?.scope ? ` • ${auditScopeLabels[log.job.scope] ?? log.job.scope}` : ""}
                        {log.job?.requestedBy ? ` • ${log.job.requestedBy}` : ""}
                      </div>
                      <div className="text-xs text-zinc-500">
                        {log.differences?.length
                          ? `${log.differences.length} ${log.differences.length === 1 ? "alteração" : "alterações"} identificada(s)`
                          : "Nenhuma diferença registrada"}
                      </div>
                    </div>
                    <span
                      className={`self-start rounded-full border px-3 py-1 text-xs font-semibold ${auditResultStyles[log.result]}`}
                    >
                      {auditResultLabels[log.result]}
                    </span>
                  </div>
                  {log.message && <p className="mt-2 text-sm text-zinc-600">{log.message}</p>}
                  {log.differences?.length ? (
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full divide-y divide-zinc-200 text-sm">
                        <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                          <tr>
                            <th className="px-4 py-2 text-left">Campo</th>
                            <th className="px-4 py-2 text-left">Antes</th>
                            <th className="px-4 py-2 text-left">Depois</th>
                            <th className="px-4 py-2 text-left">Fonte</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                          {log.differences.map((diff, index) => (
                            <tr key={`${log.id}-${diff.field}-${index}`} className="align-top">
                              <td className="px-4 py-2 text-sm text-zinc-700">
                                <span className="font-semibold">{diff.label || diff.field}</span>
                                <span className="block text-xs text-zinc-500">{diff.field}</span>
                              </td>
                              <td className="px-4 py-2">{renderDiffValue(diff.before)}</td>
                              <td className="px-4 py-2">{renderDiffValue(diff.after)}</td>
                              <td className="px-4 py-2 text-xs font-medium text-zinc-600">
                                <span className="rounded-full bg-zinc-100 px-2 py-1">
                                  {auditSourceLabels[diff.source]}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                  {log.externalData && (
                    <details className="mt-3 text-sm text-zinc-600">
                      <summary className="cursor-pointer text-xs font-semibold text-zinc-600">
                        Ver metadados da auditoria
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
                        {JSON.stringify(log.externalData, null, 2)}
                      </pre>
                    </details>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
