import { onlyDigits } from "@mdm/utils";
import { SapIntegrationSegment } from "@mdm/types";
import { Partner } from "./entities/partner.entity";

type AllowedSegment = SapIntegrationSegment | string;

export interface SapPartnerContactPayload {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface SapPartnerCommunicationPayload {
  phone?: string | null;
  mobile?: string | null;
  emails?: Array<{ address?: string | null; default?: boolean | null }> | null;
}

export interface SapPartnerPayload {
  id?: string;
  mdmPartnerId?: number | string | null;
  partnerId?: string | null;
  businessPartnerId?: string | number | null;
  sapId?: string | number | null;
  sapBusinessPartnerId?: string | number | null;
  document?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  personType?: Partner["tipo_pessoa"] | string | null;
  nature?: Partner["natureza"] | string | null;
  status?: Partner["status"] | string | null;
  contact?: SapPartnerContactPayload | null;
  communication?: SapPartnerCommunicationPayload | null;
  addresses?: any[] | null;
  banks?: any[] | null;
  vendor?: Partner["fornecedor_info"] | null;
  sales?: Partner["vendas_info"] | null;
  fiscal?: Partner["fiscal_info"] | null;
  credit?: Partner["credito_info"] | null;
  transporters?: Partner["transportadores"] | null;
  segments?: any[] | null;
  sapSegments?: any[] | null;
  sap_segments?: any[] | null;
  sapIntegration?: { segments?: any[] | null } | null;
}

const ALLOWED_SEGMENTS: AllowedSegment[] = [
  "businessPartner",
  "addresses",
  "roles",
  "banks"
];

const ALLOWED_STATUSES = ["pending", "processing", "success", "error"];

const coerceString = (value: string | number | null | undefined): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const stringValue = String(value).trim();
  return stringValue.length ? stringValue : undefined;
};

const coerceEnum = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined => {
  if (!value) return undefined;
  const normalized = value.trim();
  return allowed.includes(normalized as T) ? (normalized as T) : undefined;
};

const sanitizeEmails = (
  payload: SapPartnerCommunicationPayload | null | undefined
): Partner["comunicacao"] | undefined => {
  if (!payload) return undefined;
  const emails = Array.isArray(payload.emails)
    ? payload.emails
        .map((email) => {
          const address = coerceString(email?.address);
          if (!address) return null;
          return { endereco: address, padrao: Boolean(email?.default ?? false) };
        })
        .filter((item): item is { endereco: string; padrao?: boolean } => Boolean(item))
    : undefined;

  const normalized: Partner["comunicacao"] = {};
  if (payload.phone) {
    normalized.telefone = String(payload.phone);
  }
  if (payload.mobile) {
    normalized.celular = String(payload.mobile);
  }
  if (emails?.length) {
    normalized.emails = emails;
  }

  return Object.keys(normalized).length ? normalized : undefined;
};

const sanitizeContact = (
  payload: SapPartnerContactPayload | null | undefined
): Partner["contato_principal"] | undefined => {
  if (!payload) return undefined;
  const normalized: Partner["contato_principal"] = {
    nome: payload.name ? String(payload.name) : "",
    email: payload.email ? String(payload.email) : ""
  } as Partner["contato_principal"];

  if (!normalized.nome) delete (normalized as any).nome;
  if (!normalized.email) delete (normalized as any).email;
  if (payload.phone) {
    normalized.fone = String(payload.phone);
  }

  return Object.keys(normalized).length ? normalized : undefined;
};

const sanitizeSegments = (payload: SapPartnerPayload): Partner["sap_segments"] | undefined => {
  const sources = [
    payload.sapSegments,
    payload.segments,
    payload.sap_segments,
    payload.sapIntegration?.segments
  ];

  const rawSegments = sources.find((entry) => Array.isArray(entry));
  if (!Array.isArray(rawSegments)) {
    return undefined;
  }

  const allowedSegments = new Set(ALLOWED_SEGMENTS.map(String));

  const sanitized = rawSegments
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const segment = coerceString((entry as any).segment ?? (entry as any).code ?? (entry as any).name);
      if (!segment || !allowedSegments.has(segment)) {
        return null;
      }
      const status = coerceEnum((entry as any).status, ALLOWED_STATUSES as any);
      const normalizedStatus = status ?? "pending";
      const record: Partner["sap_segments"][number] = {
        segment: segment as SapIntegrationSegment,
        status: normalizedStatus as any
      };

      const lastAttempt = (entry as any).lastAttemptAt ?? (entry as any).last_attempt_at ?? (entry as any).lastAttempt;
      const lastSuccess = (entry as any).lastSuccessAt ?? (entry as any).last_success_at ?? (entry as any).lastSuccess;
      const message = (entry as any).message;
      const errorMessage = (entry as any).errorMessage ?? (entry as any).error_message;
      const sapId = (entry as any).sapId ?? (entry as any).sap_id ?? (entry as any).id;

      if (lastAttempt) record.lastAttemptAt = String(lastAttempt);
      if (lastSuccess) record.lastSuccessAt = String(lastSuccess);
      if (message) record.message = String(message);
      if (errorMessage) record.errorMessage = String(errorMessage);
      const normalizedSapId = coerceString(sapId);
      if (normalizedSapId) record.sapId = normalizedSapId;

      return record;
    })
    .filter((item): item is Partner["sap_segments"][number] => Boolean(item));

  if (!sanitized.length) {
    return undefined;
  }

  return sanitized.sort((a, b) => a.segment.localeCompare(b.segment));
};

export const mapSapPartnerPayload = (payload: SapPartnerPayload): Partial<Partner> => {
  const updates: Partial<Partner> = {};

  const sapId =
    coerceString(payload.sapBusinessPartnerId) ??
    coerceString(payload.sapId) ??
    coerceString(payload.businessPartnerId);
  if (sapId) {
    updates.sapBusinessPartnerId = sapId;
  }

  const legalName = coerceString(payload.legalName);
  if (legalName) {
    updates.nome_legal = legalName;
  }

  const tradeName = coerceString(payload.tradeName);
  if (tradeName) {
    updates.nome_fantasia = tradeName;
  }

  const document = coerceString(payload.document);
  if (document) {
    const digits = onlyDigits(document);
    if (digits) {
      updates.documento = digits;
    }
  }

  const personType = coerceEnum(payload.personType as string, ["PJ", "PF"]);
  if (personType) {
    updates.tipo_pessoa = personType;
  }

  const nature = coerceEnum(payload.nature as string, ["cliente", "fornecedor", "ambos"]);
  if (nature) {
    updates.natureza = nature;
  }

  const status = coerceEnum(payload.status as string, [
    "draft",
    "em_validacao",
    "aprovado",
    "rejeitado",
    "integrado"
  ]);
  if (status) {
    updates.status = status;
  }

  const contact = sanitizeContact(payload.contact);
  if (contact) {
    updates.contato_principal = contact;
  }

  const communication = sanitizeEmails(payload.communication);
  if (communication) {
    updates.comunicacao = communication;
  }

  if (Array.isArray(payload.addresses)) {
    updates.addresses = payload.addresses;
  }

  if (Array.isArray(payload.banks)) {
    updates.banks = payload.banks;
  }

  if (payload.vendor && typeof payload.vendor === "object") {
    updates.fornecedor_info = payload.vendor as Partner["fornecedor_info"];
  }

  if (payload.sales && typeof payload.sales === "object") {
    updates.vendas_info = payload.sales as Partner["vendas_info"];
  }

  if (payload.fiscal && typeof payload.fiscal === "object") {
    updates.fiscal_info = payload.fiscal as Partner["fiscal_info"];
  }

  if (payload.credit && typeof payload.credit === "object") {
    updates.credito_info = payload.credit as Partner["credito_info"];
  }

  if (Array.isArray(payload.transporters)) {
    updates.transportadores = payload.transporters as Partner["transportadores"];
  }

  const segments = sanitizeSegments(payload);
  if (segments) {
    updates.sap_segments = segments;
  }

  return updates;
};

export type SapPartnerUpdate = ReturnType<typeof mapSapPartnerPayload>;

