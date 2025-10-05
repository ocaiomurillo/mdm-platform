const FINAL_STATUSES = new Set([
  "completed",
  "concluido",
  "concluído",
  "sucesso",
  "success",
  "failed",
  "erro",
  "error",
  "cancelled",
  "canceled"
]);

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  queued: "Na fila",
  running: "Em processamento",
  processing: "Em processamento",
  completed: "Concluído",
  concluido: "Concluído",
  "concluído": "Concluído",
  sucesso: "Concluído",
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
  sucesso: "border-emerald-200 bg-emerald-50 text-emerald-700",
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

export function normalizeText(value: string | null | undefined) {
  return value ? value.toLowerCase() : "";
}

export function isFinalStatus(status: string | null | undefined) {
  const normalized = normalizeText(status);
  return normalized ? FINAL_STATUSES.has(normalized) : false;
}

export function resolveStatusLabel(status: string | null | undefined) {
  const normalized = normalizeText(status);
  if (!normalized) return "Indefinido";
  return STATUS_LABELS[normalized] ?? status ?? "Indefinido";
}

export function resolveStatusTone(status: string | null | undefined) {
  const normalized = normalizeText(status);
  if (normalized && STATUS_TONES[normalized]) {
    return STATUS_TONES[normalized];
  }
  return "border-zinc-200 bg-zinc-50 text-zinc-600";
}

export function resolveOriginLabel(origin: string | null | undefined) {
  const normalized = normalizeText(origin);
  if (!normalized) return "Não informado";
  return ORIGIN_LABELS[normalized] ?? origin ?? "Não informado";
}

export function formatDateTime(value: string | null | undefined) {
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

export function formatJobResult(value: unknown) {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

export { FINAL_STATUSES };
