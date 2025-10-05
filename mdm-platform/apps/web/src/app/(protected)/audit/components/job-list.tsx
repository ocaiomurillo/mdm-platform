"use client";

import { AlertTriangle, CircleSlash, Loader2, RefreshCw, RotateCcw } from "lucide-react";

import { AuditJobWithMetadata } from "../types";
import {
  formatDateTime,
  formatJobResult,
  isFinalStatus,
  normalizeText,
  resolveOriginLabel,
  resolveStatusLabel,
  resolveStatusTone
} from "../utils";

type AuditJobListProps = {
  jobs: AuditJobWithMetadata[];
  refreshingJobs: string[];
  reprocessingJobs: string[];
  cancelingJobs: string[];
  onRefresh: (job: AuditJobWithMetadata) => void;
  onReprocess?: (job: AuditJobWithMetadata) => void;
  onCancel?: (job: AuditJobWithMetadata) => void;
};

export function AuditJobTable({
  jobs,
  refreshingJobs,
  reprocessingJobs,
  cancelingJobs,
  onRefresh,
  onReprocess,
  onCancel
}: AuditJobListProps) {
  if (jobs.length === 0) {
    return null;
  }

  return (
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
            <th className="px-4 py-3 text-left font-medium">Resultado</th>
            <th className="px-4 py-3 text-right font-medium">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {jobs.map((job) => {
            const statusTone = resolveStatusTone(job.status);
            const normalizedStatus = resolveStatusLabel(job.status);
            const normalizedStatusKey = normalizeText(job.status);
            const isRefreshing = refreshingJobs.includes(job.jobId);
            const isReprocessing = reprocessingJobs.includes(job.jobId);
            const isCanceling = cancelingJobs.includes(job.jobId);
            const finalStatus = isFinalStatus(job.status);
            const showReprocess = typeof onReprocess === "function";
            const canReprocess = finalStatus;
            const showCancel = typeof onCancel === "function" && !finalStatus;

            return (
              <tr key={job.jobId} className="hover:bg-zinc-50">
                <td className="px-4 py-3 font-mono text-xs text-zinc-600">{job.jobId}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {job.partnerIds.length > 0 ? (
                      job.partnerIds.map((id) => (
                        <span key={id} className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                          {id}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-zinc-400">Não informado</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600">{resolveOriginLabel(job.origin)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${statusTone}`}>
                      {normalizedStatus}
                    </span>
                    {job.error ? <span className="text-xs text-red-600">{job.error}</span> : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600">{job.requestedBy ?? "-"}</td>
                <td className="px-4 py-3 text-sm text-zinc-600">{formatDateTime(job.createdAt)}</td>
                <td className="px-4 py-3 text-sm text-zinc-600">
                  {job.completedAt
                    ? formatDateTime(job.completedAt)
                    : job.lastCheckedAt
                    ? formatDateTime(job.lastCheckedAt)
                    : "-"}
                </td>
                <td className="px-4 py-3 text-sm text-zinc-600">
                  <div className="flex flex-col gap-1">
                    <span>{formatJobResult(job.result)}</span>
                    {normalizedStatusKey === "failed" || normalizedStatusKey === "erro" || normalizedStatusKey === "error" ? (
                      <span className="text-xs text-zinc-400">Considere reprocessar a auditoria.</span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onRefresh(job)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
                      disabled={isRefreshing}
                    >
                      {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      Atualizar
                    </button>
                    {showReprocess ? (
                      <button
                        type="button"
                        onClick={() => onReprocess?.(job)}
                        className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-600 transition hover:border-indigo-300 hover:text-indigo-900 disabled:opacity-60"
                        disabled={isReprocessing || !canReprocess}
                      >
                        {isReprocessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                        Reprocessar
                      </button>
                    ) : null}
                    {showCancel ? (
                      <button
                        type="button"
                        onClick={() => onCancel?.(job)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition hover:border-red-300 hover:text-red-700 disabled:opacity-60"
                        disabled={isCanceling}
                      >
                        {isCanceling ? <Loader2 className="h-3 w-3 animate-spin" /> : <CircleSlash className="h-3 w-3" />}
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AuditJobCards({
  jobs,
  refreshingJobs,
  reprocessingJobs,
  cancelingJobs,
  onRefresh,
  onReprocess,
  onCancel
}: AuditJobListProps) {
  if (jobs.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 md:hidden">
      {jobs.map((job) => {
        const statusTone = resolveStatusTone(job.status);
        const statusLabel = resolveStatusLabel(job.status);
        const normalizedStatusKey = normalizeText(job.status);
        const isRefreshing = refreshingJobs.includes(job.jobId);
        const isReprocessing = reprocessingJobs.includes(job.jobId);
        const isCanceling = cancelingJobs.includes(job.jobId);
        const finalStatus = isFinalStatus(job.status);
        const showReprocess = typeof onReprocess === "function";
        const canReprocess = finalStatus;
        const showCancel = typeof onCancel === "function" && !finalStatus;

        return (
          <article key={job.jobId} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-xs text-zinc-500">{job.jobId}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onRefresh(job)}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Atualizar
                </button>
                {showReprocess ? (
                  <button
                    type="button"
                    onClick={() => onReprocess(job)}
                    className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-[11px] font-medium text-indigo-600 transition hover:border-indigo-300 hover:text-indigo-900 disabled:opacity-60"
                    disabled={isReprocessing || !canReprocess}
                  >
                    {isReprocessing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    Reprocessar
                  </button>
                ) : null}
                {showCancel ? (
                  <button
                    type="button"
                    onClick={() => onCancel?.(job)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[11px] font-medium text-red-600 transition hover:border-red-300 hover:text-red-700 disabled:opacity-60"
                    disabled={isCanceling}
                  >
                    {isCanceling ? <Loader2 className="h-3 w-3 animate-spin" /> : <CircleSlash className="h-3 w-3" />}
                    Cancelar
                  </button>
                ) : null}
              </div>
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
                  {statusLabel}
                </span>
              </div>
              <div>Origem: {resolveOriginLabel(job.origin)}</div>
              <div>Solicitado por: {job.requestedBy ?? "-"}</div>
              <div>Criado em: {formatDateTime(job.createdAt)}</div>
              <div>
                Última atualização: {job.completedAt ? formatDateTime(job.completedAt) : job.lastCheckedAt ? formatDateTime(job.lastCheckedAt) : "-"}
              </div>
              <div>Resultado: {formatJobResult(job.result)}</div>
              {job.error ? (
                <div className="flex items-start gap-1 text-red-600">
                  <AlertTriangle className="mt-[2px] h-3 w-3" />
                  <span>{job.error}</span>
                </div>
              ) : null}
              {normalizedStatusKey === "failed" || normalizedStatusKey === "erro" || normalizedStatusKey === "error" ? (
                <div className="text-[11px] text-zinc-400">Considere reprocessar a auditoria.</div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
