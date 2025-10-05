"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { AlertCircle, CheckCircle2, Loader2, RefreshCcw, Search, Share2 } from "lucide-react";

const SAP_SEGMENTS = [
  { id: "businessPartner", label: "Dados do parceiro" },
  { id: "addresses", label: "Endereços" },
  { id: "roles", label: "Papéis" },
  { id: "banks", label: "Bancos" }
] as const;

const STATUS_LABELS: Record<string, string> = {
  success: "Sucesso",
  error: "Erro",
  processing: "Processando",
  pending: "Pendente"
};

type SapSegment = (typeof SAP_SEGMENTS)[number]["id"];

type PartnerSummary = {
  id: string;
  legalName: string;
  document: string;
  sapBusinessPartnerId?: string | null;
  status?: string;
};

type ActionFeedback = { type: "success" | "error"; message: string };

type IntegrationLog = {
  id: string;
  partnerId: string;
  partnerName?: string;
  segment: SapSegment | string;
  status: keyof typeof STATUS_LABELS | string;
  message?: string | null;
  executedAt: string;
  triggeredBy?: string | null;
};

type IntegrationLogFilters = {
  partner: string;
  segment: "all" | SapSegment;
  status: "all" | keyof typeof STATUS_LABELS;
};

const MOCK_INTEGRATION_LOGS: IntegrationLog[] = [
  {
    id: "mock-1",
    partnerId: "MDM-1001",
    partnerName: "Alpha Distribuidora Ltda",
    segment: "businessPartner",
    status: "success",
    message: "Dados principais enviados com sucesso.",
    executedAt: "2024-04-17T10:12:00Z",
    triggeredBy: "ana.silva"
  },
  {
    id: "mock-2",
    partnerId: "MDM-1001",
    partnerName: "Alpha Distribuidora Ltda",
    segment: "addresses",
    status: "success",
    message: "Endereços sincronizados.",
    executedAt: "2024-04-17T10:13:00Z",
    triggeredBy: "ana.silva"
  },
  {
    id: "mock-3",
    partnerId: "MDM-1002",
    partnerName: "Beta Serviços ME",
    segment: "roles",
    status: "error",
    message: "Falha ao validar papéis comerciais no SAP.",
    executedAt: "2024-04-17T09:41:00Z",
    triggeredBy: "joao.pereira"
  },
  {
    id: "mock-4",
    partnerId: "MDM-1003",
    partnerName: "Cooperativa Delta",
    segment: "banks",
    status: "processing",
    message: "Integração enviada. Aguardando confirmação do SAP.",
    executedAt: "2024-04-17T08:22:00Z",
    triggeredBy: "serviço.mdm"
  },
  {
    id: "mock-5",
    partnerId: "MDM-1004",
    partnerName: "Epsilon Indústria",
    segment: "businessPartner",
    status: "error",
    message: "Parceiro sem aprovação finalizada.",
    executedAt: "2024-04-16T21:45:00Z",
    triggeredBy: "marcela.sousa"
  },
  {
    id: "mock-6",
    partnerId: "MDM-1004",
    partnerName: "Epsilon Indústria",
    segment: "roles",
    status: "pending",
    message: "Aguardando processamento do job.",
    executedAt: "2024-04-16T21:50:00Z",
    triggeredBy: "marcela.sousa"
  }
];

const formatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short"
});

function formatTimestamp(timestamp: string) {
  try {
    return formatter.format(new Date(timestamp));
  } catch (error) {
    return timestamp;
  }
}

function normalizePartner(raw: any): PartnerSummary | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const id = raw.id ?? raw.mdmPartnerId ?? raw.mdm_partner_id;
  const legalName = raw.legalName ?? raw.nome_legal ?? raw.nomeLegal;
  const document = raw.document ?? raw.documento ?? raw.taxId ?? "-";
  if (!id || !legalName) {
    return null;
  }
  return {
    id: String(id),
    legalName: String(legalName),
    document: String(document),
    sapBusinessPartnerId: raw.sapBusinessPartnerId ?? raw.sap_bp_id ?? raw.sapBusinessPartner ?? null,
    status: raw.status ?? raw.partnerStatus ?? null
  };
}

function normalizeIntegrationLog(entry: any): IntegrationLog | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const id = entry.id ?? entry.logId ?? `${entry.partnerId ?? entry.partner_id}-${entry.segment ?? entry.sapSegment ?? "unknown"}-${entry.executedAt ?? entry.created_at ?? Date.now()}`;
  const partnerId = entry.partnerId ?? entry.partner_id ?? entry.mdmPartnerId ?? entry.mdm_partner_id;
  const segment = entry.segment ?? entry.sapSegment ?? entry.integration_segment;
  const status = entry.status ?? entry.result ?? entry.integration_status;
  const executedAt = entry.executedAt ?? entry.createdAt ?? entry.created_at ?? entry.timestamp;
  if (!id || !partnerId || !segment || !status || !executedAt) {
    return null;
  }
  return {
    id: String(id),
    partnerId: String(partnerId),
    partnerName: entry.partnerName ?? entry.partner_name ?? entry.legalName ?? entry.nome_legal ?? undefined,
    segment: String(segment),
    status: String(status),
    message: entry.message ?? entry.detail ?? entry.errorMessage ?? entry.error_message ?? null,
    executedAt: String(executedAt),
    triggeredBy: entry.triggeredBy ?? entry.triggered_by ?? entry.user ?? null
  };
}

function applyFilters(logs: IntegrationLog[], filters: IntegrationLogFilters) {
  return logs.filter((log) => {
    const matchPartner = filters.partner
      ? [log.partnerId, log.partnerName ?? ""]
          .some((value) => value.toLowerCase().includes(filters.partner.toLowerCase()))
      : true;
    const matchSegment = filters.segment === "all" ? true : log.segment === filters.segment;
    const matchStatus = filters.status === "all" ? true : log.status === filters.status;
    return matchPartner && matchSegment && matchStatus;
  });
}

function sanitizeDocument(value: string) {
  return value.replace(/\D+/g, "");
}

function getStatusToneClasses(status: string) {
  switch (status) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "error":
      return "border-red-200 bg-red-50 text-red-700";
    case "processing":
      return "border-indigo-200 bg-indigo-50 text-indigo-700";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
  }
}

export default function IntegrationsPage() {
  const [searchType, setSearchType] = useState<"id" | "cnpj" | "cpf">("id");
  const [searchValue, setSearchValue] = useState("");
  const [partner, setPartner] = useState<PartnerSummary | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [filters, setFilters] = useState<IntegrationLogFilters>({ partner: "", segment: "all", status: "all" });
  const [formFilters, setFormFilters] = useState<IntegrationLogFilters>({ partner: "", segment: "all", status: "all" });
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [logsUsingMock, setLogsUsingMock] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  const fetchPartner = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      if (event) {
        event.preventDefault();
      }
      const input = searchValue.trim();
      if (!input) {
        setSearchError("Informe um identificador do parceiro.");
        return;
      }
      setSearching(true);
      setSearchError(null);
      setPartner(null);
      try {
        if (!apiUrl) {
          throw new Error("API não configurada");
        }
        const token = localStorage.getItem("mdmToken");
        if (!token) {
          throw new Error("Sessão expirada. Faça login novamente.");
        }
        let url = `${apiUrl}/partners/${encodeURIComponent(input)}`;
        if (searchType === "cnpj") {
          url = `${apiUrl}/partners/cnpj/${sanitizeDocument(input)}`;
        } else if (searchType === "cpf") {
          url = `${apiUrl}/partners/cpf/${sanitizeDocument(input)}`;
        }
        const response = await axios.get(url, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const summary = normalizePartner(response.data?.partner ?? response.data);
        if (!summary) {
          throw new Error("Parceiro não encontrado ou resposta inválida.");
        }
        setPartner(summary);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem("mdmToken");
        }
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message ?? error.message
          : (error as Error).message;
        setSearchError(message || "Não foi possível localizar o parceiro.");
      } finally {
        setSearching(false);
      }
    },
    [apiUrl, searchType, searchValue]
  );

  const triggerIntegration = useCallback(
    async (type: "retry" | "segment", segment?: SapSegment) => {
      if (!partner) {
        setActionFeedback({ type: "error", message: "Selecione um parceiro antes de disparar integrações." });
        return;
      }
      try {
        if (!apiUrl) {
          throw new Error("API não configurada");
        }
        const token = localStorage.getItem("mdmToken");
        if (!token) {
          throw new Error("Sessão expirada. Faça login novamente.");
        }
        const partnerId = partner.id;
        let url = `${apiUrl}/partners/${partnerId}/integrations/sap/retry`;
        if (type === "segment" && segment) {
          url = `${apiUrl}/partners/${partnerId}/integrations/sap/${segment}`;
        }
        setActionLoading(type === "retry" ? "retry" : `segment-${segment}`);
        await axios.post(url, {}, { headers: { Authorization: `Bearer ${token}` } });
        const segmentLabel = segment
          ? SAP_SEGMENTS.find((item) => item.id === segment)?.label ?? segment
          : null;
        const successMessage =
          type === "retry"
            ? "Integração completa reenfileirada com sucesso."
            : `Segmento ${segmentLabel ?? segment ?? ""} enviado ao SAP.`;
        setActionFeedback({ type: "success", message: successMessage });
        setTimeout(() => {
          setActionFeedback(null);
        }, 4000);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem("mdmToken");
        }
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message ?? error.message
          : (error as Error).message;
        setActionFeedback({ type: "error", message: message || "Falha ao disparar integração." });
      } finally {
        setActionLoading(null);
      }
    },
    [apiUrl, partner]
  );

  const fetchIntegrationLogs = useCallback(
    async (currentFilters: IntegrationLogFilters) => {
      setLogsLoading(true);
      setLogsError(null);
      try {
        if (!apiUrl) {
          throw new Error("API não configurada");
        }
        const token = localStorage.getItem("mdmToken");
        if (!token) {
          throw new Error("Sessão expirada. Faça login novamente.");
        }
        const response = await axios.get(`${apiUrl}/integrations/logs`, {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            partner: currentFilters.partner || undefined,
            segment: currentFilters.segment === "all" ? undefined : currentFilters.segment,
            status: currentFilters.status === "all" ? undefined : currentFilters.status
          }
        });
        const payload = response.data?.items ?? response.data?.data ?? response.data;
        const entries = Array.isArray(payload) ? payload : [];
        const normalized = entries
          .map((item) => normalizeIntegrationLog(item))
          .filter((item): item is IntegrationLog => Boolean(item));
        setLogs(normalized);
        setLogsUsingMock(false);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem("mdmToken");
        }
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message ?? error.message
          : (error as Error).message;
        setLogsError(message || "Não foi possível carregar o log de integrações.");
        setLogs(applyFilters(MOCK_INTEGRATION_LOGS, currentFilters));
        setLogsUsingMock(true);
      } finally {
        setLogsLoading(false);
      }
    },
    [apiUrl]
  );

  useEffect(() => {
    fetchIntegrationLogs(filters);
  }, [fetchIntegrationLogs, filters]);

  const handleFiltersSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFilters(formFilters);
  };

  const logsToDisplay = useMemo(() => {
    if (logsUsingMock) {
      return applyFilters(MOCK_INTEGRATION_LOGS, filters);
    }
    return logs;
  }, [filters, logs, logsUsingMock]);

  return (
    <div className="flex flex-col gap-8 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-zinc-900">Integrações SAP</h1>
        <p className="text-sm text-zinc-600">
          Localize parceiros e dispare novamente os segmentos de integração com o SAP. Consulte o histórico de integrações para
          acompanhar o status dos envios.
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Forçar integração</h2>
            <p className="text-sm text-zinc-600">
              Busque um parceiro pelo identificador ou documento e reenvie os segmentos necessários para o SAP.
            </p>
          </div>
          <Share2 className="hidden h-8 w-8 text-zinc-400 md:block" />
        </div>

        <form onSubmit={fetchPartner} className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700 md:w-40">
            Tipo de busca
            <select
              value={searchType}
              onChange={(event) => setSearchType(event.target.value as "id" | "cnpj" | "cpf")}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm focus:border-zinc-900 focus:outline-none"
            >
              <option value="id">ID do parceiro</option>
              <option value="cnpj">CNPJ</option>
              <option value="cpf">CPF</option>
            </select>
          </label>

          <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-zinc-700">
            Valor
            <div className="relative">
              <input
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Informe o identificador do parceiro"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 pr-10 text-sm text-zinc-800 shadow-sm focus:border-zinc-900 focus:outline-none"
              />
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            </div>
          </label>

          <button
            type="submit"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            disabled={searching}
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            <span>Buscar parceiro</span>
          </button>
        </form>

        {searchError ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{searchError}</span>
          </div>
        ) : null}

        {partner ? (
          <div className="mt-6 space-y-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">{partner.legalName}</h3>
                <div className="text-sm text-zinc-600">
                  <span className="font-medium">ID MDM:</span> {partner.id}
                  {partner.sapBusinessPartnerId ? (
                    <span className="ml-3">
                      <span className="font-medium">SAP BP:</span> {partner.sapBusinessPartnerId}
                    </span>
                  ) : null}
                </div>
                <div className="text-sm text-zinc-600">
                  <span className="font-medium">Documento:</span> {partner.document}
                  {partner.status ? (
                    <span className="ml-3">
                      <span className="font-medium">Status:</span> {partner.status}
                    </span>
                  ) : null}
                </div>
              </div>
              {actionFeedback ? (
                <div
                  className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                    actionFeedback.type === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {actionFeedback.type === "success" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4" />
                  )}
                  <span>{actionFeedback.message}</span>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 lg:flex-row">
              <button
                type="button"
                onClick={() => triggerIntegration("retry")}
                disabled={actionLoading === "retry"}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {actionLoading === "retry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                <span>Forçar integração completa</span>
              </button>

              <div className="flex flex-1 flex-wrap gap-2">
                {SAP_SEGMENTS.map((segment) => {
                  const loading = actionLoading === `segment-${segment.id}`;
                  return (
                    <button
                      key={segment.id}
                      type="button"
                      onClick={() => triggerIntegration("segment", segment.id)}
                      disabled={loading}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                      <span>{segment.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Log de integrações</h2>
            <p className="text-sm text-zinc-600">
              Monitore as tentativas de envio ao SAP e filtre por parceiro, segmento ou status.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchIntegrationLogs(filters)}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
            disabled={logsLoading}
          >
            {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
            <span>Atualizar</span>
          </button>
        </div>

        <form onSubmit={handleFiltersSubmit} className="mt-4 grid gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Parceiro
            <input
              value={formFilters.partner}
              onChange={(event) => setFormFilters((prev) => ({ ...prev, partner: event.target.value }))}
              placeholder="ID ou nome do parceiro"
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-800 shadow-sm focus:border-zinc-900 focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Segmento
            <select
              value={formFilters.segment}
              onChange={(event) => setFormFilters((prev) => ({ ...prev, segment: event.target.value as "all" | SapSegment }))}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm focus:border-zinc-900 focus:outline-none"
            >
              <option value="all">Todos</option>
              {SAP_SEGMENTS.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Status
            <select
              value={formFilters.status}
              onChange={(event) => setFormFilters((prev) => ({ ...prev, status: event.target.value as "all" | keyof typeof STATUS_LABELS }))}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm focus:border-zinc-900 focus:outline-none"
            >
              <option value="all">Todos</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              disabled={logsLoading}
            >
              {logsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              <span>Aplicar filtros</span>
            </button>
          </div>
        </form>

        {logsError ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            <AlertCircle className="mt-0.5 h-4 w-4" />
            <span>{logsError}</span>
          </div>
        ) : null}

        <div className="mt-6 overflow-hidden rounded-lg border border-zinc-200">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Parceiro</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Segmento</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Mensagem</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Executado em</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">Disparado por</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {logsLoading && logsToDisplay.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Carregando registros...
                    </span>
                  </td>
                </tr>
              ) : null}

              {!logsLoading && logsToDisplay.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">
                    Nenhum registro encontrado com os filtros informados.
                  </td>
                </tr>
              ) : null}

              {logsToDisplay.map((log) => (
                <tr key={`${log.id}-${log.executedAt}`} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 text-sm text-zinc-700">
                    <div className="font-semibold text-zinc-900">{log.partnerName ?? log.partnerId}</div>
                    <div className="text-xs text-zinc-500">{log.partnerId}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-700">{SAP_SEGMENTS.find((segment) => segment.id === log.segment)?.label ?? log.segment}</td>
                  <td className="px-4 py-3 text-sm text-zinc-700">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${getStatusToneClasses(log.status)}`}>
                      {STATUS_LABELS[log.status] ?? log.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600">{log.message ?? "-"}</td>
                  <td className="px-4 py-3 text-sm text-zinc-600">{formatTimestamp(log.executedAt)}</td>
                  <td className="px-4 py-3 text-sm text-zinc-600">{log.triggeredBy ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {logsUsingMock ? (
          <p className="mt-3 text-xs text-zinc-500">
            Exibindo dados simulados porque o endpoint de log de integrações ainda não está disponível.
          </p>
        ) : null}
      </section>
    </div>
  );
}
