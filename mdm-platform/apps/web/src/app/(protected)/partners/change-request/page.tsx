"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import {
  changeRequestFieldDefinitions,
  ChangeRequestFieldId,
  ChangeRequestPayload
} from "@mdm/types";
import type { Partner } from "@mdm/types";

type Mode = "individual" | "massa";

type PartnerSummary = {
  id: string;
  nome_legal: string;
  documento: string;
  status?: string;
};

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

type ChangeRequestListResponse = {
  items: ChangeRequestItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

const fieldInputTypes: Record<ChangeRequestFieldId, "text" | "number" | "date" | "textarea"> = {
  "nome_legal": "text",
  "nome_fantasia": "text",
  "contato_principal.nome": "text",
  "contato_principal.email": "text",
  "contato_principal.fone": "text",
  "comunicacao.telefone": "text",
  "comunicacao.celular": "text",
  "fornecedor_info.grupo": "text",
  "fornecedor_info.condicao_pagamento": "text",
  "vendas_info.vendedor": "text",
  "vendas_info.grupo_clientes": "text",
  "fiscal_info.natureza_operacao": "text",
  "fiscal_info.tipo_beneficio_suframa": "text",
  "fiscal_info.regime_declaracao": "text",
  "credito_info.parceiro": "text",
  "credito_info.modalidade": "text",
  "credito_info.montante": "number",
  "credito_info.validade": "date"
};

const numericFields = new Set<ChangeRequestFieldId>(["credito_info.montante"]);
const dateFields = new Set<ChangeRequestFieldId>(["credito_info.validade"]);

const originOptions = [
  { value: "interno" as const, label: "Interno" },
  { value: "externo" as const, label: "Externo" }
];

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

const buildEmptyFieldState = () =>
  Object.fromEntries(
    changeRequestFieldDefinitions.map((definition) => [definition.id, { enabled: false, value: "" }])
  ) as Record<ChangeRequestFieldId, { enabled: boolean; value: string }>;

const buildEmptyFieldErrors = () =>
  Object.fromEntries(changeRequestFieldDefinitions.map((definition) => [definition.id, null])) as Record<
    ChangeRequestFieldId,
    string | null
  >;

const formatDateTime = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
};

const resolveValue = (source: any, path: string) =>
  path.split(".").reduce<any>((current, segment) => {
    if (current === undefined || current === null) return undefined;
    return current[segment];
  }, source);

const normalizeValue = (field: ChangeRequestFieldId, raw: string) => {
  if (raw === undefined || raw === null) return null;
  const trimmed = raw.trim();
  if (!trimmed.length) return null;
  if (numericFields.has(field)) {
    const parsed = Number(trimmed.replace(/\s+/g, ""));
    return Number.isNaN(parsed) ? trimmed : parsed;
  }
  if (dateFields.has(field)) {
    return trimmed;
  }
  return trimmed;
};

const buildPartnerSummary = (partner: Partner): PartnerSummary => ({
  id: partner.id,
  nome_legal: partner.nome_legal,
  documento: partner.documento,
  status: partner.status
});

type SubmitResult =
  | { type: "individual"; request: ChangeRequestItem }
  | { type: "massa"; batchId: string; total: number; requests: ChangeRequestItem[] };

const formatValueForDisplay = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : "—";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    return value.map((item) => formatValueForDisplay(item)).join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch (error) {
      return String(value);
    }
  }
  return String(value);
};

const parseBulkInput = (value: string, initialId?: string | null) => {
  const ids = new Set<string>();
  if (initialId) {
    ids.add(initialId);
  }
  value
    .split(/[\n,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((id) => ids.add(id));
  return Array.from(ids);
};

const convertToInputValue = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
};

type TabKey = "form" | "existing";

export default function ChangeRequestPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const partnerId = searchParams.get("partner");

  const [mode, setMode] = useState<Mode>("individual");
  const [origin, setOrigin] = useState<(typeof originOptions)[number]["value"]>(originOptions[0]?.value ?? "interno");
  const [fields, setFields] = useState(buildEmptyFieldState);
  const [fieldErrors, setFieldErrors] = useState(buildEmptyFieldErrors);
  const [motivo, setMotivo] = useState("");
  const [bulkInput, setBulkInput] = useState("");
  const [partner, setPartner] = useState<Partner | null>(null);
  const [partnerSummary, setPartnerSummary] = useState<PartnerSummary | null>(null);
  const [partnerLoading, setPartnerLoading] = useState(false);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  const [requests, setRequests] = useState<ChangeRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestsError, setRequestsError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<SubmitResult | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("form");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  const parsedBulkPartnerIds = useMemo(
    () => parseBulkInput(bulkInput, mode === "massa" ? partnerId : undefined),
    [bulkInput, mode, partnerId]
  );

  const loadPartner = useCallback(async () => {
    if (!partnerId) {
      setPartnerError("Selecione um parceiro para criar a solicitação.");
      setPartner(null);
      setPartnerSummary(null);
      return;
    }
    if (!apiUrl) {
      setPartnerError("URL da API não configurada.");
      setPartner(null);
      setPartnerSummary(null);
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("mdmToken") : null;
    if (!token) {
      router.replace("/login");
      return;
    }

    setPartnerLoading(true);
    setPartnerError(null);
    try {
      const response = await axios.get(`${apiUrl}/partners/${partnerId}/details`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = response.data ?? {};
      const partnerData: Partner | null = data?.partner ?? data ?? null;
      setPartner(partnerData);
      setPartnerSummary(partnerData ? buildPartnerSummary(partnerData) : null);
    } catch (error: any) {
      if (error?.response?.status === 401) {
        localStorage.removeItem("mdmToken");
        router.replace("/login");
        return;
      }
      const message = error?.response?.data?.message;
      setPartnerError(typeof message === "string" ? message : "Não foi possível carregar o parceiro.");
      setPartner(null);
      setPartnerSummary(null);
    } finally {
      setPartnerLoading(false);
    }
  }, [apiUrl, partnerId, router]);

  const loadChangeRequests = useCallback(async () => {
    if (!partnerId || !apiUrl) {
      setRequests([]);
      return;
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("mdmToken") : null;
    if (!token) {
      router.replace("/login");
      return;
    }

    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const response = await axios.get(`${apiUrl}/partners/${partnerId}/change-requests?page=1&pageSize=20`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data: ChangeRequestListResponse = response.data ?? {
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 1
      };
      setRequests(Array.isArray(data.items) ? data.items : []);
    } catch (error: any) {
      if (error?.response?.status === 401) {
        localStorage.removeItem("mdmToken");
        router.replace("/login");
        return;
      }
      const message = error?.response?.data?.message;
      setRequestsError(typeof message === "string" ? message : "Não foi possível carregar as solicitações.");
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, [apiUrl, partnerId, router]);

  useEffect(() => {
    loadPartner();
  }, [loadPartner]);

  useEffect(() => {
    loadChangeRequests();
  }, [loadChangeRequests]);

  useEffect(() => {
    setFields(buildEmptyFieldState());
    setFieldErrors(buildEmptyFieldErrors());
    setMotivo("");
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitResult(null);
    setBulkInput(mode === "massa" && partnerId ? partnerId : "");
  }, [partnerId]);

  useEffect(() => {
    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitResult(null);
    if (mode === "massa" && !bulkInput.trim() && partnerId) {
      setBulkInput(partnerId);
    }
  }, [mode, partnerId]);

  const handleToggleField = (fieldId: ChangeRequestFieldId) => {
    setFields((current) => {
      const definition = changeRequestFieldDefinitions.find((item) => item.id === fieldId);
      const currentState = current[fieldId];
      const enabled = !currentState?.enabled;
      let value = currentState?.value ?? "";
      if (enabled && !value && partner && definition) {
        const existing = resolveValue(partner, definition.path);
        value = convertToInputValue(existing);
      }
      if (!enabled) {
        value = "";
      }
      return {
        ...current,
        [fieldId]: { enabled, value }
      };
    });
    setFieldErrors((current) => ({ ...current, [fieldId]: null }));
  };

  const handleFieldChange = (fieldId: ChangeRequestFieldId, value: string) => {
    setFields((current) => ({
      ...current,
      [fieldId]: { ...(current[fieldId] ?? { enabled: false, value: "" }), value }
    }));
    setFieldErrors((current) => ({ ...current, [fieldId]: null }));
  };

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
  };

  const evaluateFields = useCallback(
    (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const errors = buildEmptyFieldErrors();
      const payload: { field: ChangeRequestFieldId; label: string; newValue: unknown }[] = [];
      let enabledCount = 0;
      let hasErrors = false;

      for (const definition of changeRequestFieldDefinitions) {
        const state = fields[definition.id];
        if (!state?.enabled) {
          continue;
        }
        enabledCount += 1;
        const normalized = normalizeValue(definition.id, state.value ?? "");
        if (normalized === null) {
          errors[definition.id] = "Informe um valor.";
          hasErrors = true;
          continue;
        }
        if (numericFields.has(definition.id) && typeof normalized !== "number") {
          errors[definition.id] = "Informe um número válido.";
          hasErrors = true;
          continue;
        }
        if (dateFields.has(definition.id)) {
          const parsed = new Date(normalized as string);
          if (Number.isNaN(parsed.getTime())) {
            errors[definition.id] = "Informe uma data válida.";
            hasErrors = true;
            continue;
          }
        }
        payload.push({ field: definition.id, label: definition.label, newValue: normalized });
      }

      if (!silent) {
        setFieldErrors(errors);
      }

      return { payload, enabledCount, hasErrors };
    },
    [fields]
  );

  const buildPayloadPreview = useMemo(() => {
    if (!partner || !partnerSummary) return null;
    if (mode === "massa" && parsedBulkPartnerIds.length === 0) return null;

    const evaluation = evaluateFields({ silent: true });
    if (!evaluation.enabledCount || evaluation.hasErrors) {
      return null;
    }

    const motivoTrimmed = motivo.trim();
    if (!motivoTrimmed) {
      return null;
    }

    const entries =
      mode === "massa"
        ? parsedBulkPartnerIds.map((id) => ({
            partnerId: id,
            partnerName: id === partnerSummary.id ? partnerSummary.nome_legal : "Parceiro",
            document: id === partnerSummary.id ? partnerSummary.documento : undefined,
            changes: evaluation.payload.map((field) => {
              const definition = changeRequestFieldDefinitions.find((item) => item.id === field.field);
              return {
                field: field.field,
                label: field.label,
                previousValue:
                  id === partnerSummary.id && definition
                    ? resolveValue(partner, definition.path)
                    : undefined,
                newValue: field.newValue ?? null
              };
            })
          }))
        : [
            {
              partnerId: partnerSummary.id,
              partnerName: partnerSummary.nome_legal,
              document: partnerSummary.documento,
              changes: evaluation.payload.map((field) => {
                const definition = changeRequestFieldDefinitions.find((item) => item.id === field.field);
                return {
                  field: field.field,
                  label: field.label,
                  previousValue: definition ? resolveValue(partner, definition.path) : undefined,
                  newValue: field.newValue ?? null
                };
              })
            }
          ];

    return {
      tipo: mode,
      motivo: motivoTrimmed,
      origin,
      partners: entries
    } satisfies ChangeRequestPayload;
  }, [evaluateFields, mode, motivo, origin, parsedBulkPartnerIds, partner, partnerSummary]);

  const handleSubmit = async () => {
    if (!partnerId) {
      setSubmitError("Selecione um parceiro para prosseguir.");
      return;
    }
    if (!apiUrl) {
      setSubmitError("URL da API não configurada.");
      return;
    }

    setSubmitError(null);
    setSubmitSuccess(null);
    setSubmitResult(null);

    const motivoTrimmed = motivo.trim();
    if (!motivoTrimmed) {
      setSubmitError("Informe o motivo da alteração.");
      return;
    }

    const evaluation = evaluateFields();
    if (!evaluation.enabledCount) {
      setSubmitError("Selecione ao menos um campo para alteração.");
      return;
    }
    if (evaluation.hasErrors) {
      setSubmitError("Corrija os campos destacados antes de continuar.");
      return;
    }

    let partnerIds: string[] = [];
    if (mode === "massa") {
      partnerIds = parsedBulkPartnerIds;
      if (!partnerIds.length) {
        setSubmitError("Informe ao menos um parceiro para a solicitação em massa.");
        return;
      }
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("mdmToken") : null;
    if (!token) {
      router.replace("/login");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "individual") {
        const response = await axios.post(
          `${apiUrl}/partners/${partnerId}/change-requests`,
          {
            fields: evaluation.payload,
            motivo: motivoTrimmed,
            origin
          },
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        const data: ChangeRequestItem = response.data;
        setSubmitResult({ type: "individual", request: data });
        setSubmitSuccess("Solicitação criada com sucesso.");
      } else {
        const response = await axios.post(
          `${apiUrl}/partners/change-requests/bulk`,
          {
            fields: evaluation.payload,
            motivo: motivoTrimmed,
            origin,
            partnerIds
          },
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        );
        const data = response.data ?? {};
        setSubmitResult({
          type: "massa",
          batchId: data?.batchId ?? "",
          total: data?.total ?? 0,
          requests: Array.isArray(data?.requests) ? data.requests : []
        });
        setSubmitSuccess("Solicitações em massa enviadas com sucesso.");
      }
      await loadChangeRequests();
    } catch (error: any) {
      if (error?.response?.status === 401) {
        localStorage.removeItem("mdmToken");
        router.replace("/login");
        return;
      }
      const message = error?.response?.data?.message;
      setSubmitError(typeof message === "string" ? message : "Não foi possível criar a solicitação.");
    } finally {
      setSubmitting(false);
    }
  };

  if (partnerLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-sm text-zinc-600">
        Carregando parceiro...
      </main>
    );
  }

  if (partnerError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{partnerError}</div>
      </main>
    );
  }

  if (!partner || !partnerSummary) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 p-6 text-sm text-zinc-500">
        Parceiro não encontrado.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <button
            type="button"
            onClick={() => router.back()}
            className="self-start text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-900"
          >
            Voltar
          </button>
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold text-zinc-900">Solicitar alteração</h1>
              <p className="text-sm text-zinc-500">
                {partnerSummary.nome_legal} · Documento: {partnerSummary.documento}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-zinc-600">
              <span className="rounded-full bg-zinc-100 px-3 py-1">ID: {partnerSummary.id}</span>
              <span className="rounded-full bg-zinc-100 px-3 py-1">Status: {partnerSummary.status ?? "-"}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => handleModeChange("individual")}
              className={`rounded-lg px-3 py-2 font-medium transition-colors ${
                mode === "individual" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("massa")}
              className={`rounded-lg px-3 py-2 font-medium transition-colors ${
                mode === "massa" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Em massa
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => setActiveTab("form")}
              className={`rounded-lg px-3 py-2 font-medium transition-colors ${
                activeTab === "form" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Nova solicitação
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("existing")}
              className={`rounded-lg px-3 py-2 font-medium transition-colors ${
                activeTab === "existing" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Solicitações existentes
            </button>
          </div>

          {activeTab === "form" ? (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 rounded-xl border border-zinc-100 bg-zinc-50 p-4">
                <label className="text-sm font-medium text-zinc-700">Origem</label>
                <div className="flex flex-wrap gap-3">
                  {originOptions.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm text-zinc-600">
                      <input
                        type="radio"
                        name="origin"
                        value={option.value}
                        checked={origin === option.value}
                        onChange={() => setOrigin(option.value)}
                        className="h-4 w-4"
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                <label className="text-sm font-medium text-zinc-700" htmlFor="motivo">
                  Motivo
                </label>
                <textarea
                  id="motivo"
                  className="min-h-[96px] rounded-lg border border-zinc-200 p-3 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                  placeholder="Descreva o motivo da alteração"
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                />

                {mode === "massa" ? (
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-zinc-700" htmlFor="bulk-partners">
                      Parceiros (IDs separados por vírgula, espaço ou quebra de linha)
                    </label>
                    <textarea
                      id="bulk-partners"
                      className="min-h-[96px] rounded-lg border border-zinc-200 p-3 text-sm text-zinc-700 focus:border-zinc-900 focus:outline-none"
                      placeholder="Informe os IDs dos parceiros"
                      value={bulkInput}
                      onChange={(event) => setBulkInput(event.target.value)}
                    />
                    <p className="text-xs text-zinc-500">{parsedBulkPartnerIds.length} parceiro(s) selecionado(s).</p>
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Campos disponíveis</h2>
                <div className="grid gap-4 lg:grid-cols-2">
                  {changeRequestFieldDefinitions.map((definition) => {
                    const state = fields[definition.id];
                    const enabled = state?.enabled ?? false;
                    const fieldError = fieldErrors[definition.id];
                    const previousValue = resolveValue(partner, definition.path);
                    const inputType = fieldInputTypes[definition.id] ?? "text";

                    return (
                      <div key={definition.id} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={() => handleToggleField(definition.id)}
                              className="h-4 w-4"
                            />
                            {definition.label}
                          </label>
                          <span className="text-xs text-zinc-500">Atual: {formatValueForDisplay(previousValue)}</span>
                        </div>
                        {enabled ? (
                          inputType === "textarea" ? (
                            <textarea
                              className={`min-h-[96px] rounded-lg border p-3 text-sm focus:outline-none ${
                                fieldError ? "border-red-400" : "border-zinc-200 focus:border-zinc-900"
                              }`}
                              value={state?.value ?? ""}
                              onChange={(event) => handleFieldChange(definition.id, event.target.value)}
                            />
                          ) : (
                            <input
                              type={inputType === "date" ? "date" : inputType}
                              className={`rounded-lg border p-3 text-sm focus:outline-none ${
                                fieldError ? "border-red-400" : "border-zinc-200 focus:border-zinc-900"
                              }`}
                              value={state?.value ?? ""}
                              onChange={(event) => handleFieldChange(definition.id, event.target.value)}
                            />
                          )
                        ) : null}
                        {fieldError ? <p className="text-xs text-red-500">{fieldError}</p> : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              {submitError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{submitError}</div>
              ) : null}
              {submitSuccess ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {submitSuccess}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Salvando..." : mode === "individual" ? "Salvar solicitação" : "Salvar em massa"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFields(buildEmptyFieldState());
                    setFieldErrors(buildEmptyFieldErrors());
                    setMotivo("");
                    setBulkInput(mode === "massa" && partnerId ? partnerId : "");
                    setSubmitError(null);
                    setSubmitSuccess(null);
                    setSubmitResult(null);
                  }}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900"
                >
                  Limpar
                </button>
              </div>

              {submitResult ? (
                <div className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <h3 className="text-sm font-semibold text-zinc-700">Resumo da solicitação enviada</h3>
                  {submitResult.type === "individual" ? (
                    <div className="text-sm text-zinc-600">
                      <p>
                        <span className="font-semibold">ID:</span> {submitResult.request.id}
                      </p>
                      <p>
                        <span className="font-semibold">Status:</span> {statusLabels[submitResult.request.status] ?? submitResult.request.status}
                      </p>
                      <p>
                        <span className="font-semibold">Criado em:</span> {formatDateTime(submitResult.request.createdAt)}
                      </p>
                    </div>
                  ) : (
                    <div className="text-sm text-zinc-600">
                      <p>
                        <span className="font-semibold">Lote:</span> {submitResult.batchId || "—"}
                      </p>
                      <p>
                        <span className="font-semibold">Total:</span> {submitResult.total}
                      </p>
                      <div className="flex flex-col gap-2">
                        <span className="font-semibold">Solicitações:</span>
                        <ul className="list-disc space-y-1 pl-4 text-xs">
                          {submitResult.requests.map((request) => (
                            <li key={request.id}>
                              {request.partnerId} · {statusLabels[request.status] ?? request.status} · {formatDateTime(request.createdAt)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {buildPayloadPreview ? (
                <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-zinc-700">Pré-visualização do payload</h3>
                  <pre className="max-h-80 overflow-y-auto rounded-lg bg-zinc-900/90 p-4 text-xs text-white">
                    {JSON.stringify(buildPayloadPreview, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {requestsError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{requestsError}</div>
              ) : null}
              {requestsLoading ? <p className="text-sm text-zinc-500">Carregando solicitações...</p> : null}
              {!requestsLoading && !requests.length ? <p className="text-sm text-zinc-500">Nenhuma solicitação encontrada.</p> : null}
              <div className="flex flex-col gap-3">
                {requests.map((request) => (
                  <div key={request.id} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      <span className="rounded-full bg-zinc-100 px-3 py-1">{typeLabels[request.requestType] ?? request.requestType}</span>
                      <span className="rounded-full bg-zinc-100 px-3 py-1">{statusLabels[request.status] ?? request.status}</span>
                      <span className="rounded-full bg-zinc-100 px-3 py-1">{formatDateTime(request.createdAt)}</span>
                    </div>
                    <div className="text-sm text-zinc-700">
                      <p>
                        <span className="font-semibold">Motivo:</span> {request.motivo || "—"}
                      </p>
                      <p>
                        <span className="font-semibold">Solicitante:</span> {request.requestedBy || "—"}
                      </p>
                    </div>
                    {Array.isArray(request.payload?.partners) && request.payload?.partners.length ? (
                      <div className="flex flex-col gap-3 rounded-lg bg-zinc-50 p-3 text-xs text-zinc-600">
                        {request.payload.partners.map((entry) => (
                          <div key={entry.partnerId} className="flex flex-col gap-2">
                            <p className="font-semibold text-zinc-700">
                              Parceiro: {entry.partnerName} ({entry.partnerId})
                            </p>
                            <ul className="space-y-1">
                              {entry.changes.map((change, index) => (
                                <li key={`${entry.partnerId}-${change.field}-${index}`} className="rounded-md border border-zinc-200 bg-white p-2">
                                  <p className="font-semibold text-zinc-700">{change.label ?? change.field}</p>
                                  <p>Anterior: {formatValueForDisplay(change.previousValue)}</p>
                                  <p>Novo: {formatValueForDisplay(change.newValue)}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export {
  buildEmptyFieldErrors,
  buildEmptyFieldState,
  convertToInputValue,
  formatValueForDisplay,
  normalizeValue,
  parseBulkInput
};
