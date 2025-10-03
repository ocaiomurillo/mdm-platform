import type { SapIntegrationSegmentState, SapIntegrationStatus } from "@mdm/types";

export type SapOverallTone = "success" | "error" | "processing" | "pending";

export const SAP_SEGMENT_ORDER: SapIntegrationSegmentState["segment"][] = [
  "businessPartner",
  "addresses",
  "roles",
  "banks"
];

export const SAP_SEGMENT_LABELS: Record<SapIntegrationSegmentState["segment"], string> = {
  businessPartner: "Dados principais",
  addresses: "Endereços",
  roles: "Funções",
  banks: "Bancos"
};

export const SAP_STATUS_LABELS: Record<SapIntegrationStatus, string> = {
  pending: "Pendente",
  processing: "Processando",
  success: "Sucesso",
  error: "Erro"
};

export type SapOverallStatus = {
  label: string;
  tone: SapOverallTone;
  description: string;
  disabled: boolean;
};

export function mapSapSegments(raw: any): SapIntegrationSegmentState[] {
  const map = new Map<SapIntegrationSegmentState["segment"], SapIntegrationSegmentState>();
  if (Array.isArray(raw)) {
    raw.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const segment = item.segment as SapIntegrationSegmentState["segment"] | undefined;
      if (!segment) return;
      map.set(segment, { ...item, segment } as SapIntegrationSegmentState);
    });
  }

  const ordered = SAP_SEGMENT_ORDER.map((segment) => {
    const current = map.get(segment);
    return current ? { ...current, segment } : ({ segment, status: "pending" } as SapIntegrationSegmentState);
  });

  const extras = Array.isArray(raw)
    ? raw.filter((item) => item?.segment && !SAP_SEGMENT_ORDER.includes(item.segment))
    : [];

  return [...ordered, ...extras] as SapIntegrationSegmentState[];
}

export function summarizeSapOverall(segments: SapIntegrationSegmentState[]): SapOverallStatus {
  if (!segments.length || segments.every((segment) => segment.status === "pending")) {
    return {
      label: "Pendente",
      tone: "pending",
      description: "Aguardando processamento no SAP.",
      disabled: false
    };
  }

  if (segments.some((segment) => segment.status === "error")) {
    return {
      label: "Erro na integração",
      tone: "error",
      description: "Existe ao menos um segmento com falha. Reprocessar para tentar novamente.",
      disabled: false
    };
  }

  if (segments.some((segment) => segment.status === "processing")) {
    return {
      label: "Processando",
      tone: "processing",
      description: "Integração em andamento. Aguarde a conclusão.",
      disabled: false
    };
  }

  const allSuccess = segments.every((segment) => segment.status === "success");
  if (allSuccess) {
    const disabled = segments.every((segment) =>
      (segment.message ?? "").toLowerCase().includes("desativad")
    );
    return {
      label: disabled ? "Integração desativada" : "Integrado ao SAP",
      tone: disabled ? "pending" : "success",
      description: disabled
        ? "O envio automático ao SAP está desativado via configuração."
        : "Todos os segmentos foram sincronizados com sucesso.",
      disabled
    };
  }

  return {
    label: "Parcialmente integrado",
    tone: "processing",
    description: "Alguns segmentos ainda não foram sincronizados com o SAP.",
    disabled: false
  };
}

export function shouldAllowSapRetry(segments: SapIntegrationSegmentState[]): boolean {
  if (!segments.length) return true;
  return segments.some((segment) => segment.status !== "success");
}
