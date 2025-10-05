"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock4,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Users
} from "lucide-react";

import { getStoredUser, StoredUser } from "../../../lib/auth";
import {
  AuditJob,
  fetchAuditJobStatus,
  triggerBulkAudit,
  triggerIndividualAudit
} from "./audit-service";

type FeedbackState = {
  type: "success" | "error";
  message: string;
};

type DisplayJob = AuditJob & {
  lastCheckedAt?: string | null;
};

const FINAL_STATUSES = new Set(["completed", "concluido", "concluído", "sucesso", "success", "failed", "erro", "error", "cancelled", "canceled"]);

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  queued: "Na fila",
  running: "Em processamento",
  processing: "Em processamento",
  completed: "Concluído",
  concluido: "Concluído",
  "concluído": "Concluído",
  success: "Concluído",
  failed: "Falhou",
  erro: "Falhou",
  error: "Falhou",
  cancelled: "Cancelado",
  canceled: "Cancelado"
};

const STATUS_TONES: Record<string, string> = {
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  concluido: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "concluído": "border-emerald-200 bg-emerald-50 text-emerald-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  running: "border-indigo-200 bg-indigo-50 text-indigo-700",
  processing: "border-indigo-200 bg-indigo-50 text-indigo-700",
  pending: "border-amber-200 bg-amber-50 text-amber-700",
  queued: "border-amber-200 bg-amber-50 text-amber-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  erro: "border-red-200 bg-red-50 text-red-700",
  error: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-zinc-200 bg-zinc-50 text-zinc-600",
  canceled: "border-zinc-200 bg-zinc-50 text-zinc-600"
};

const ORIGIN_LABELS: Record<string, string> = {
  individual: "Individual",
  bulk: "Em massa"
};

function normalizeText(value: string | null | undefined) {
  return value ? value.toLowerCase() : "";
}

function isFinalStatus(status: string | null | undefined) {
  const normalized = normalizeText(status);
  return normalized ? FINAL_STATUSES.has(normalized) : false;
}

function resolveStatusLabel(status: string | null | undefined) {
  const normalized = normalizeText(status);
  if (!normalized) return "Indefinido";
  return STATUS_LABELS[normalized] ?? status ?? "Indefinido";
}

function resolveStatusTone(status: string | null | undefined) {
  const normalized = normalizeText(status);
  if (normalized && STATUS_TONES[normalized]) {
    return STATUS_TONES[normalized];
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

function resolveOriginLabel(origin: string | null | undefined) {
  const normalized = normalizeText(origin);
  if (!normalized) return "Não informado";
  return ORIGIN_LABELS[normalized] ?? origin ?? "Não informado";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function parsePartnerIds(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(/\r?\n|,|;|\s+/)
        .map((id) => id.trim())
        .filter((id) => id.length > 0)
    )
  );
}

export default function AuditPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [individualPartnerId, setIndividualPartnerId] = useState("");
  const [bulkPartnerIds, setBulkPartnerIds] = useState("");
  const [manualJobId, setManualJobId] = useState("");
  const [jobs, setJobs] = useState<DisplayJob[]>([]);
  const [partnerFilter, setPartnerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [individualLoading, setIndividualLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [refreshingJobs, setRefreshingJobs] = useState<string[]>([]);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";

  useEffect(() => {
    const storedToken = globalThis.localStorage?.getItem("mdmToken");
    if (!storedToken) {
      router.replace("/login");
      return;
    }
    setToken(storedToken);
    setCurrentUser(getStoredUser());
    setInitialized(true);
  }, [router]);

  const handleAuthIssue = useCallback(() => {
    globalThis.localStorage?.removeItem("mdmToken");
    setToken(null);
    router.replace("/login");
  }, [router]);

  const buildErrorMessage = useCallback(
    (error: any, fallback: string) => {
      const status = error?.response?.status;
      if (status === 401) {
        handleAuthIssue();
        return "Sessão expirada. Faça login novamente.";
      }
      if (status === 403) {
        return "Você não tem autorização para executar esta ação.";
      }
      const responseMessage = error?.response?.data?.message;
      if (typeof responseMessage === "string") {
        return responseMessage;
      }
      if (Array.isArray(responseMessage)) {
        return responseMessage.join(" ");
      }
      return fallback;
    },
    [handleAuthIssue]
  );

  const upsertJob = useCallback((job: AuditJob) => {
    const timestamp = new Date().toISOString();
    setJobs((prev) => {
      const previous = prev.find((existing) => existing.jobId === job.jobId);
      const withoutCurrent = prev.filter((existing) => existing.jobId !== job.jobId);
      return [
        {
          ...previous,
          ...job,
          createdAt: job.createdAt ?? previous?.createdAt ?? timestamp,
          lastCheckedAt: timestamp
        },
        ...withoutCurrent
      ];
    });
  }, []);

  const refreshJob = useCallback(
    async (jobId: string) => {
      if (!token || !apiUrl) return;
      try {
        setRefreshingJobs((prev) => (prev.includes(jobId) ? prev : [...prev, jobId]));
        const job = await fetchAuditJobStatus({ apiUrl, token, jobId });
        const timestamp = new Date().toISOString();
        setJobs((prev) =>
          prev.map((existing) =>
            existing.jobId === job.jobId
              ? {
                  ...existing,
                  ...job,
                  partnerIds: job.partnerIds.length > 0 ? job.partnerIds : existing.partnerIds,
                  origin: job.origin || existing.origin,
                  lastCheckedAt: timestamp,
                  error: job.error ?? existing.error
                }
              : existing
          )
        );
      } catch (error: any) {
        const message = buildErrorMessage(error, "Não foi possível atualizar o status do job.");
        setFeedback({ type: "error", message });
      } finally {
        setRefreshingJobs((prev) => prev.filter((id) => id !== jobId));
      }
    },
    [apiUrl, token, buildErrorMessage]
  );

  useEffect(() => {
    if (!token || !apiUrl) return;
    const pendingJobs = jobs.filter((job) => !isFinalStatus(job.status));
    if (pendingJobs.length === 0) return;

    const interval = window.setInterval(() => {
      pendingJobs.forEach((job) => {
        refreshJob(job.jobId);
      });
    }, 5000);

    return () => window.clearInterval(interval);
  }, [jobs, token, apiUrl, refreshJob]);

  const handleTriggerIndividual = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedPartner = individualPartnerId.trim();
      if (!trimmedPartner) {
        setFeedback({ type: "error", message: "Informe o identificador do parceiro." });
        return;
      }
      if (!token || !apiUrl) {
        setFeedback({ type: "error", message: "Configuração de API ausente. Verifique as variáveis de ambiente." });
        return;
      }
      setIndividualLoading(true);
      try {
        const job = await triggerIndividualAudit({
          apiUrl,
          token,
          partnerId: trimmedPartner,
          requestedBy: currentUser?.email ?? currentUser?.id ?? null
        });
        upsertJob(job);
        setFeedback({ type: "success", message: "Auditoria individual solicitada com sucesso." });
        setIndividualPartnerId("");
        if (!isFinalStatus(job.status)) {
          refreshJob(job.jobId);
        }
      } catch (error: any) {
        const message = buildErrorMessage(error, "Não foi possível solicitar a auditoria do parceiro.");
        setFeedback({ type: "error", message });
      } finally {
        setIndividualLoading(false);
      }
    },
    [individualPartnerId, token, apiUrl, currentUser, upsertJob, refreshJob, buildErrorMessage]
  );

  const handleTriggerBulk = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const parsedIds = parsePartnerIds(bulkPartnerIds);
      if (parsedIds.length === 0) {
        setFeedback({ type: "error", message: "Informe ao menos um parceiro para a auditoria em massa." });
        return;
      }
      if (!token || !apiUrl) {
        setFeedback({ type: "error", message: "Configuração de API ausente. Verifique as variáveis de ambiente." });
        return;
      }
      setBulkLoading(true);
      try {
        const job = await triggerBulkAudit({
          apiUrl,
          token,
          partnerIds: parsedIds,
          requestedBy: currentUser?.email ?? currentUser?.id ?? null
        });
        upsertJob(job);
        setFeedback({
          type: "success",
          message: `Auditoria em massa iniciada para ${parsedIds.length} parceiro(s).`
        });
        setBulkPartnerIds("");
        if (!isFinalStatus(job.status)) {
          refreshJob(job.jobId);
        }
      } catch (error: any) {
        const message = buildErrorMessage(error, "Não foi possível solicitar a auditoria em massa.");
        setFeedback({ type: "error", message });
      } finally {
        setBulkLoading(false);
      }
    },
    [bulkPartnerIds, token, apiUrl, currentUser, upsertJob, refreshJob, buildErrorMessage]
  );

  const handleFetchManualJob = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = manualJobId.trim();
      if (!trimmed) {
        setFeedback({ type: "error", message: "Informe o identificador do job de auditoria." });
        return;
      }
      if (!token || !apiUrl) {
        setFeedback({ type: "error", message: "Configuração de API ausente. Verifique as variáveis de ambiente." });
        return;
      }
      setManualLoading(true);
      try {
        const job = await fetchAuditJobStatus({ apiUrl, token, jobId: trimmed });
        upsertJob(job);
        setFeedback({ type: "success", message: "Status de auditoria atualizado." });
        setManualJobId("");
      } catch (error: any) {
        const message = buildErrorMessage(error, "Não foi possível localizar o job informado.");
        setFeedback({ type: "error", message });
      } finally {
        setManualLoading(false);
      }
    },
    [manualJobId, token, apiUrl, upsertJob, buildErrorMessage]
  );

  const statusOptions = useMemo(() => {
    const base = new Set(["pending", "queued", "running", "processing", "completed", "failed"]);
    jobs.forEach((job) => {
      const normalized = normalizeText(job.status);
      if (normalized) {
        base.add(normalized);
      }
    });
    return Array.from(base);
  }, [jobs]);

  const originOptions = useMemo(() => {
    const base = new Set(["individual", "bulk"]);
    jobs.forEach((job) => {
      const normalized = normalizeText(job.origin);
      if (normalized) {
        base.add(normalized);
      }
    });
    return Array.from(base);
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const normalizedPartnerFilter = partnerFilter.trim().toLowerCase();
    const normalizedStatusFilter = normalizeText(statusFilter === "all" ? "" : statusFilter);
    const normalizedOriginFilter = normalizeText(originFilter === "all" ? "" : originFilter);

    return jobs
      .filter((job) => {
        const partnerMatch = normalizedPartnerFilter
          ? job.partnerIds.some((id) => id.toLowerCase().includes(normalizedPartnerFilter))
          : true;
        const statusMatch = normalizedStatusFilter
          ? normalizeText(job.status) === normalizedStatusFilter
          : true;
        const originMatch = normalizedOriginFilter
          ? normalizeText(job.origin) === normalizedOriginFilter
          : true;
        return partnerMatch && statusMatch && originMatch;
      })
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });
  }, [jobs, partnerFilter, statusFilter, originFilter]);

  if (!initialized) {
    return <div className="min-h-screen bg-zinc-100" />;
  }

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-zinc-100 p-6 text-zinc-900">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-zinc-900">
          <ShieldCheck className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Auditoria de Parceiros</h1>
        </div>
        <p className="text-sm text-zinc-500">
          Dispare auditorias individuais ou em massa e acompanhe o progresso dos jobs já executados.
        </p>
      </header>

      {feedback ? (
        <div
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          <span>{feedback.message}</span>
          <button
            type="button"
            className="ml-auto text-xs font-medium uppercase tracking-wide text-inherit/70 hover:text-inherit"
            onClick={() => setFeedback(null)}
          >
            Fechar
          </button>
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <form onSubmit={handleTriggerIndividual} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
            <Play className="h-4 w-4 text-emerald-600" />
            Auditoria individual
          </div>
          <p className="text-xs text-zinc-500">
            Informe o identificador do parceiro para solicitar uma nova verificação imediata.
          </p>
          <input
            value={individualPartnerId}
            onChange={(event) => setIndividualPartnerId(event.target.value)}
            placeholder="ID ou documento do parceiro"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
          />
          <button
            type="submit"
            disabled={individualLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {individualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Solicitar auditoria
          </button>
        </form>

        <form onSubmit={handleTriggerBulk} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
            <ClipboardList className="h-4 w-4 text-indigo-600" />
            Auditoria em massa
          </div>
          <p className="text-xs text-zinc-500">
            Cole múltiplos identificadores separados por vírgula, espaço ou quebra de linha para criar um job em lote.
          </p>
          <textarea
            value={bulkPartnerIds}
            onChange={(event) => setBulkPartnerIds(event.target.value)}
            placeholder="Parceiro 1, Parceiro 2, ..."
            rows={4}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
          />
          <button
            type="submit"
            disabled={bulkLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-indigo-300"
          >
            {bulkLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Iniciar auditoria em massa
          </button>
        </form>
      </section>

      <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <form onSubmit={handleFetchManualJob} className="grid gap-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-3 text-sm md:grid-cols-[1fr_auto] md:items-center">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Consultar job existente</label>
            <input
              value={manualJobId}
              onChange={(event) => setManualJobId(event.target.value)}
              placeholder="ID do job de auditoria"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>
          <button
            type="submit"
            disabled={manualLoading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400"
          >
            {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Consultar status
          </button>
        </form>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Filtrar por parceiro</label>
            <input
              value={partnerFilter}
              onChange={(event) => setPartnerFilter(event.target.value)}
              placeholder="ID, documento ou termo"
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            >
              <option value="all">Todos</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {resolveStatusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Origem</label>
            <select
              value={originFilter}
              onChange={(event) => setOriginFilter(event.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200"
            >
              <option value="all">Todas</option>
              {originOptions.map((origin) => (
                <option key={origin} value={origin}>
                  {resolveOriginLabel(origin)}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden flex-col gap-1 md:flex">
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Jobs monitorados</label>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
              {jobs.length}
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Clock4 className="h-4 w-4" />
          <span>Jobs concluídos e em andamento</span>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
            <AlertCircle className="mb-2 h-6 w-6 text-zinc-400" />
            Nenhum job encontrado com os filtros atuais.
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white md:block">
              <table className="min-w-full divide-y divide-zinc-200 text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Job</th>
                    <th className="px-4 py-3 text-left font-medium">Parceiros</th>
                    <th className="px-4 py-3 text-left font-medium">Origem</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Solicitado por</th>
                    <th className="px-4 py-3 text-left font-medium">Criado em</th>
                    <th className="px-4 py-3 text-left font-medium">Atualizado</th>
                    <th className="px-4 py-3 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {filteredJobs.map((job) => {
                    const statusTone = resolveStatusTone(job.status);
                    const normalizedStatus = resolveStatusLabel(job.status);
                    const isRefreshing = refreshingJobs.includes(job.jobId);
                    return (
                      <tr key={job.jobId} className="hover:bg-zinc-50">
                        <td className="px-4 py-3 font-mono text-xs text-zinc-600">{job.jobId}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {job.partnerIds.length > 0
                              ? job.partnerIds.map((id) => (
                                  <span
                                    key={id}
                                    className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600"
                                  >
                                    {id}
                                  </span>
                                ))
                              : (
                                <span className="text-xs text-zinc-400">Não informado</span>
                                )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600">{resolveOriginLabel(job.origin)}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusTone}`}
                            >
                              {normalizedStatus}
                            </span>
                            {job.error ? (
                              <span className="text-xs text-red-600">{job.error}</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600">{job.requestedBy ?? "-"}</td>
                        <td className="px-4 py-3 text-sm text-zinc-600">{formatDateTime(job.createdAt)}</td>
                        <td className="px-4 py-3 text-sm text-zinc-600">
                          {job.completedAt ? formatDateTime(job.completedAt) : job.lastCheckedAt ? formatDateTime(job.lastCheckedAt) : "-"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => refreshJob(job.jobId)}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
                            disabled={isRefreshing}
                          >
                            {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                            Atualizar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:hidden">
              {filteredJobs.map((job) => {
                const statusTone = resolveStatusTone(job.status);
                const isRefreshing = refreshingJobs.includes(job.jobId);
                return (
                  <article key={job.jobId} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-xs text-zinc-500">{job.jobId}</div>
                      <button
                        type="button"
                        onClick={() => refreshJob(job.jobId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
                        disabled={isRefreshing}
                      >
                        {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                        Atualizar
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.partnerIds.length > 0 ? (
                        job.partnerIds.map((id) => (
                          <span key={id} className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600">
                            {id}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-zinc-400">Parceiros não informados</span>
                      )}
                    </div>
                    <div className="mt-3 flex flex-col gap-1 text-xs text-zinc-500">
                      <div>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone}`}>
                          {resolveStatusLabel(job.status)}
                        </span>
                      </div>
                      <div>Origem: {resolveOriginLabel(job.origin)}</div>
                      <div>Solicitado por: {job.requestedBy ?? "-"}</div>
                      <div>Criado em: {formatDateTime(job.createdAt)}</div>
                      <div>
                        Última atualização: {job.completedAt ? formatDateTime(job.completedAt) : job.lastCheckedAt ? formatDateTime(job.lastCheckedAt) : "-"}
                      </div>
                      {job.error ? <div className="flex items-start gap-1 text-red-600"><AlertTriangle className="mt-[2px] h-3 w-3" />{job.error}</div> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
