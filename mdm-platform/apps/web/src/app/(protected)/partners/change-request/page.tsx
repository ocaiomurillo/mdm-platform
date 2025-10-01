"use client";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useSearchParams } from "next/navigation";
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

const buildEmptyFieldState = () => {
  return Object.fromEntries(
    changeRequestFieldDefinitions.map((definition) => [definition.id, { enabled: false, value: "" }])
  ) as Record<ChangeRequestFieldId, { enabled: boolean; value: string }>;
};

const formatDateTime = (value: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
};

const resolveValue = (source: any, path: string) => {
  return path.split(".").reduce<any>((current, segment) => {
    if (current === undefined || current === null) return undefined;
    return current[segment];
  }, source);
};

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

