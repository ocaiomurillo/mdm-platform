import axios from "axios";

export type AuditJob = {
  jobId: string;
  status: string;
  partnerIds: string[];
  origin: string;
  requestedBy?: string | null;
  createdAt?: string | null;
  completedAt?: string | null;
  error?: string | null;
  payload?: unknown;
  result?: unknown;
  raw?: unknown;
  lastCheckedAt?: string | null;
};

type BaseParams = {
  apiUrl: string;
  token: string;
};

type TriggerIndividualParams = BaseParams & {
  partnerId: string;
  requestedBy?: string | null;
};

type TriggerBulkParams = BaseParams & {
  partnerIds: string[];
  requestedBy?: string | null;
};

type FetchStatusParams = BaseParams & {
  jobId: string;
};

type AuditJobActionParams = FetchStatusParams & {
  currentJob?: AuditJob;
};

const DEFAULT_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`
});

export function normalizeAuditJob(raw: any, defaults: Partial<AuditJob> = {}): AuditJob {
  const partnerIds = Array.isArray(raw?.partnerIds)
    ? (raw.partnerIds as string[])
    : Array.isArray(defaults.partnerIds)
      ? defaults.partnerIds
      : [];

  const jobId = String(raw?.jobId ?? raw?.id ?? defaults.jobId ?? "");

  const normalized: AuditJob = {
    jobId,
    status: String(raw?.status ?? defaults.status ?? "pending"),
    partnerIds,
    origin: String(raw?.origin ?? defaults.origin ?? "desconhecida"),
    requestedBy: raw?.requestedBy ?? raw?.requested_by ?? defaults.requestedBy ?? null,
    createdAt: raw?.createdAt ?? raw?.created_at ?? defaults.createdAt ?? null,
    completedAt: raw?.completedAt ?? raw?.completed_at ?? defaults.completedAt ?? null,
    error: raw?.error ?? raw?.errorMessage ?? raw?.message ?? defaults.error ?? null,
    payload: raw?.payload ?? defaults.payload ?? null,
    result: raw?.result ?? defaults.result ?? null,
    raw,
    lastCheckedAt: defaults.lastCheckedAt ?? null
  };

  if (!normalized.jobId) {
    throw new Error("Resposta de auditoria sem identificador de job");
  }

  return normalized;
}

export async function triggerIndividualAudit({ apiUrl, token, partnerId, requestedBy }: TriggerIndividualParams) {
  const url = `${apiUrl.replace(/\/$/, "")}/partners/${encodeURIComponent(partnerId)}/audit`;
  const payload = requestedBy ? { requestedBy } : {};
  const response = await axios.post(url, payload, { headers: DEFAULT_HEADERS(token) });
  return normalizeAuditJob(response?.data ?? {}, {
    jobId: response?.data?.jobId ?? response?.data?.id ?? partnerId,
    origin: "individual",
    partnerIds: [partnerId],
    requestedBy: requestedBy ?? null
  });
}

export async function triggerBulkAudit({ apiUrl, token, partnerIds, requestedBy }: TriggerBulkParams) {
  const cleanedPartnerIds = partnerIds.filter((id) => id.trim().length > 0);
  const url = `${apiUrl.replace(/\/$/, "")}/partners/audit`;
  const payload = {
    partnerIds: cleanedPartnerIds,
    ...(requestedBy ? { requestedBy } : {})
  };
  const response = await axios.post(url, payload, { headers: DEFAULT_HEADERS(token) });
  return normalizeAuditJob(response?.data ?? {}, {
    jobId: response?.data?.jobId ?? response?.data?.id ?? cleanedPartnerIds.join(","),
    origin: "bulk",
    partnerIds: cleanedPartnerIds,
    requestedBy: requestedBy ?? null
  });
}

export async function fetchAuditJobStatus({ apiUrl, token, jobId }: FetchStatusParams) {
  const url = `${apiUrl.replace(/\/$/, "")}/partners/audit/${encodeURIComponent(jobId)}`;
  const response = await axios.get(url, { headers: DEFAULT_HEADERS(token) });
  return normalizeAuditJob(response?.data ?? {}, {
    jobId,
    origin: response?.data?.origin ?? "bulk",
    partnerIds: Array.isArray(response?.data?.partnerIds) ? response.data.partnerIds : [],
    requestedBy: response?.data?.requestedBy ?? null
  });
}

export async function reprocessAuditJob({ apiUrl, token, jobId, currentJob }: AuditJobActionParams) {
  const url = `${apiUrl.replace(/\/$/, "")}/partners/audit/${encodeURIComponent(jobId)}/reprocess`;
  const response = await axios.post(url, {}, { headers: DEFAULT_HEADERS(token) });
  return normalizeAuditJob(response?.data ?? {}, {
    jobId,
    origin: response?.data?.origin ?? currentJob?.origin ?? "bulk",
    partnerIds: Array.isArray(response?.data?.partnerIds)
      ? response.data.partnerIds
      : currentJob?.partnerIds ?? [],
    requestedBy: response?.data?.requestedBy ?? currentJob?.requestedBy ?? null,
    status: response?.data?.status ?? currentJob?.status ?? "pending"
  });
}

export async function cancelAuditJob({ apiUrl, token, jobId, currentJob }: AuditJobActionParams) {
  const url = `${apiUrl.replace(/\/$/, "")}/partners/audit/${encodeURIComponent(jobId)}/cancel`;
  const response = await axios.post(url, {}, { headers: DEFAULT_HEADERS(token) });
  return normalizeAuditJob(response?.data ?? {}, {
    jobId,
    origin: response?.data?.origin ?? currentJob?.origin ?? "bulk",
    partnerIds: Array.isArray(response?.data?.partnerIds)
      ? response.data.partnerIds
      : currentJob?.partnerIds ?? [],
    requestedBy: response?.data?.requestedBy ?? currentJob?.requestedBy ?? null,
    status: response?.data?.status ?? currentJob?.status ?? "pending"
  });
}
