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
  cancelAuditJob,
  fetchAuditJobStatus,
  reprocessAuditJob,
  triggerBulkAudit,
  triggerIndividualAudit
} from "./audit-service";
import type { AuditJob } from "./audit-service";
import { AuditJobCards, AuditJobTable } from "./components/job-list";
import { AuditJobWithMetadata } from "./types";
import { isFinalStatus, normalizeText, resolveOriginLabel, resolveStatusLabel } from "./utils";

type FeedbackState = {
  type: "success" | "error";
  message: string;
};


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
  const [jobs, setJobs] = useState<AuditJobWithMetadata[]>([]);
  const [partnerFilter, setPartnerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [individualLoading, setIndividualLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [refreshingJobs, setRefreshingJobs] = useState<string[]>([]);
  const [reprocessingJobs, setReprocessingJobs] = useState<string[]>([]);
  const [cancelingJobs, setCancelingJobs] = useState<string[]>([]);

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
          lastCheckedAt: timestamp,
          result: job.result ?? previous?.result ?? null
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
                  error: job.error ?? existing.error,
                  result: job.result ?? existing.result
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

  const handleRefreshFromList = useCallback(
    (job: AuditJobWithMetadata) => {
      refreshJob(job.jobId);
    },
    [refreshJob]
  );

  const handleReprocessJob = useCallback(
    async (job: AuditJobWithMetadata) => {
      if (!token || !apiUrl) {
        setFeedback({ type: "error", message: "Configuração de API ausente. Verifique as variáveis de ambiente." });
        return;
      }
      setReprocessingJobs((prev) => (prev.includes(job.jobId) ? prev : [...prev, job.jobId]));
      try {
        const updated = await reprocessAuditJob({ apiUrl, token, jobId: job.jobId, currentJob: job });
        upsertJob(updated);
        setFeedback({ type: "success", message: "Reprocessamento solicitado com sucesso." });
        if (!isFinalStatus(updated.status)) {
          refreshJob(updated.jobId);
        }
      } catch (error: any) {
        if (error?.response?.status === 404) {
          setFeedback({ type: "error", message: "Reprocessamento não suportado pela API atual." });
        } else {
          const message = buildErrorMessage(error, "Não foi possível reprocessar a auditoria.");
          setFeedback({ type: "error", message });
        }
      } finally {
        setReprocessingJobs((prev) => prev.filter((id) => id !== job.jobId));
      }
    },
    [token, apiUrl, upsertJob, refreshJob, buildErrorMessage]
  );

  const handleCancelJob = useCallback(
    async (job: AuditJobWithMetadata) => {
      if (!token || !apiUrl) {
        setFeedback({ type: "error", message: "Configuração de API ausente. Verifique as variáveis de ambiente." });
        return;
      }
      setCancelingJobs((prev) => (prev.includes(job.jobId) ? prev : [...prev, job.jobId]));
      try {
        const updated = await cancelAuditJob({ apiUrl, token, jobId: job.jobId, currentJob: job });
        upsertJob(updated);
        setFeedback({ type: "success", message: "Job de auditoria cancelado." });
        refreshJob(updated.jobId);
      } catch (error: any) {
        if (error?.response?.status === 404) {
          setFeedback({ type: "error", message: "Cancelamento não suportado pela API atual." });
        } else {
          const message = buildErrorMessage(error, "Não foi possível cancelar a auditoria.");
          setFeedback({ type: "error", message });
        }
      } finally {
        setCancelingJobs((prev) => prev.filter((id) => id !== job.jobId));
      }
    },
    [token, apiUrl, upsertJob, refreshJob, buildErrorMessage]
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
            <AuditJobTable
              jobs={filteredJobs}
              refreshingJobs={refreshingJobs}
              reprocessingJobs={reprocessingJobs}
              cancelingJobs={cancelingJobs}
              onRefresh={handleRefreshFromList}
              onReprocess={handleReprocessJob}
              onCancel={handleCancelJob}
            />
            <AuditJobCards
              jobs={filteredJobs}
              refreshingJobs={refreshingJobs}
              reprocessingJobs={reprocessingJobs}
              cancelingJobs={cancelingJobs}
              onRefresh={handleRefreshFromList}
              onReprocess={handleReprocessJob}
              onCancel={handleCancelJob}
            />
          </>
        )}
      </section>
    </main>
  );
}
