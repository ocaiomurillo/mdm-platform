import { Injectable, Logger } from "@nestjs/common";
import {
  SapIntegrationSegment,
  SapIntegrationSegmentState,
  SapIntegrationStatus
} from "@mdm/types";
import { Partner } from "./entities/partner.entity";

export type SapIntegrationResult = {
  segments: SapIntegrationSegmentState[];
  completed: boolean;
  updates: Partial<Partner>;
};

export type SapIntegrationOptions = {
  segments?: SapIntegrationSegment[];
  onStateChange?: (segments: SapIntegrationSegmentState[]) => Promise<void> | void;
};

const DEFAULT_SEGMENTS: SapIntegrationSegment[] = [
  "businessPartner",
  "addresses",
  "roles",
  "banks"
];

type SegmentConfig = {
  method: "POST" | "PUT";
  path: string;
  buildPayload: (partner: Partner) => any;
  successMessage: string;
};

@Injectable()
export class SapIntegrationService {
  private readonly logger = new Logger(SapIntegrationService.name);

  async integratePartner(partner: Partner, options: SapIntegrationOptions = {}): Promise<SapIntegrationResult> {
    let states = this.prepareInitialState(partner.sap_segments);
    const segments = this.normalizeSegments(options.segments, true);

    if (!segments.length) {
      return { segments: states, completed: true, updates: {} };
    }

    if (!this.isEnabled()) {
      const now = new Date().toISOString();
      states = states.map((state) =>
        segments.includes(state.segment)
          ? {
              ...state,
              status: "success",
              lastAttemptAt: now,
              lastSuccessAt: now,
              message: "Integração SAP desativada (SAP_SYNC_ENABLED=false)",
              errorMessage: undefined
            }
          : state
      );
      await this.notifyStateChange(options, states);
      return { segments: states, completed: true, updates: {} };
    }

    if (!this.isConfigured()) {
      const now = new Date().toISOString();
      const message = "Configuração SAP incompleta. Defina SAP_BASE_URL, SAP_USER e SAP_PASSWORD.";
      states = states.map((state) =>
        segments.includes(state.segment)
          ? {
              ...state,
              status: "error",
              lastAttemptAt: now,
              errorMessage: message
            }
          : state
      );
      await this.notifyStateChange(options, states);
      return { segments: states, completed: false, updates: {} };
    }

    let completed = true;
    const updates: Partial<Partner> = {};

    for (const segment of segments) {
      const attemptAt = new Date().toISOString();
      states = this.upsertState(states, {
        segment,
        status: "processing",
        lastAttemptAt: attemptAt,
        errorMessage: undefined,
        message: undefined
      });
      await this.notifyStateChange(options, states);

      try {
        const response = await this.dispatchSegment(segment, partner);
        const segmentUpdates = this.extractPartnerUpdates(segment, response);
        if (Object.keys(segmentUpdates).length) {
          Object.assign(updates, segmentUpdates);
        }

        const sapId = this.extractSegmentIdentifier(segment, response, segmentUpdates);
        const successState: SapIntegrationSegmentState = {
          segment,
          status: "success",
          lastAttemptAt: attemptAt,
          lastSuccessAt: new Date().toISOString(),
          message: this.segmentConfig[segment].successMessage,
          errorMessage: undefined,
          sapId: sapId ?? undefined
        };
        states = this.upsertState(states, successState);
        await this.notifyStateChange(options, states);
      } catch (error) {
        completed = false;
        const message =
          error instanceof Error ? error.message : "Falha desconhecida ao integrar com o SAP";
        this.logger.error(
          `Falha ao integrar parceiro ${partner.id} no segmento ${segment}: ${message}`,
          error instanceof Error ? error.stack : undefined
        );
        states = this.upsertState(states, {
          segment,
          status: "error",
          lastAttemptAt: attemptAt,
          errorMessage: message
        });
        await this.notifyStateChange(options, states);
        break;
      }
    }

    return { segments: states, completed, updates };
  }

  async retry(partner: Partner, options: SapIntegrationOptions = {}): Promise<SapIntegrationResult> {
    const states = this.prepareInitialState(partner.sap_segments);
    const failed = states.filter((state) => state.status !== "success").map((state) => state.segment);
    const targets = options.segments?.length ? options.segments : failed;
    const segments = this.normalizeSegments(targets, false);
    if (!segments.length) {
      return { segments: states, completed: true, updates: {} };
    }
    return this.integratePartner(partner, { ...options, segments });
  }

  private normalizeSegments(
    segments: SapIntegrationSegment[] | undefined,
    fallbackToDefault: boolean
  ): SapIntegrationSegment[] {
    if (!segments) {
      return fallbackToDefault ? [...DEFAULT_SEGMENTS] : [];
    }
    if (!segments.length) {
      return fallbackToDefault ? [...DEFAULT_SEGMENTS] : [];
    }
    const allowed = new Set(DEFAULT_SEGMENTS);
    return Array.from(new Set(segments.filter((segment) => allowed.has(segment))));
  }

  private prepareInitialState(existing: SapIntegrationSegmentState[] = []): SapIntegrationSegmentState[] {
    const map = new Map(existing.map((state) => [state.segment, state]));
    return DEFAULT_SEGMENTS.map((segment) => {
      const current = map.get(segment);
      return current
        ? { ...current, segment: current.segment }
        : { segment, status: "pending" as SapIntegrationStatus };
    });
  }

  private upsertState(
    states: SapIntegrationSegmentState[],
    next: SapIntegrationSegmentState
  ): SapIntegrationSegmentState[] {
    const exists = states.some((state) => state.segment === next.segment);
    if (!exists) {
      return [...states, next];
    }
    return states.map((state) => (state.segment === next.segment ? { ...state, ...next } : state));
  }

  private async notifyStateChange(
    options: SapIntegrationOptions,
    states: SapIntegrationSegmentState[]
  ) {
    if (!options.onStateChange) return;
    const snapshot = states.map((state) => ({ ...state }));
    await options.onStateChange(snapshot);
  }

  private get isEnabled(): boolean {
    return process.env.SAP_SYNC_ENABLED !== "false";
  }

  private get isConfigured(): boolean {
    return Boolean(this.baseUrl && this.user && this.password);
  }

  private get baseUrl(): string {
    return (process.env.SAP_BASE_URL || "").replace(/\/$/, "");
  }

  private get user(): string {
    return process.env.SAP_USER || "";
  }

  private get password(): string {
    return process.env.SAP_PASSWORD || "";
  }

  private get timeout(): number {
    const raw = process.env.SAP_REQUEST_TIMEOUT;
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
  }

  private get authorizationHeader(): string | null {
    if (!this.user && !this.password) return null;
    const token = Buffer.from(`${this.user}:${this.password}`).toString("base64");
    return `Basic ${token}`;
  }

  private segmentConfig: Record<SapIntegrationSegment, SegmentConfig> = {
    businessPartner: {
      method: "POST",
      path: "/business-partners",
      successMessage: "Parceiro principal sincronizado",
      buildPayload: (partner) => ({
        mdmPartnerId: partner.mdmPartnerId,
        partnerId: partner.id,
        document: partner.documento,
        name: partner.nome_legal,
        tradeName: partner.nome_fantasia,
        type: partner.tipo_pessoa,
        nature: partner.natureza,
        contact: partner.contato_principal,
        fiscal: partner.fiscal_info
      })
    },
    addresses: {
      method: "PUT",
      path: "/business-partners/addresses",
      successMessage: "Endereços sincronizados",
      buildPayload: (partner) => ({
        businessPartnerId: partner.sapBusinessPartnerId ?? null,
        mdmPartnerId: partner.mdmPartnerId,
        partnerId: partner.id,
        document: partner.documento,
        addresses: partner.addresses
      })
    },
    roles: {
      method: "PUT",
      path: "/business-partners/roles",
      successMessage: "Funções sincronizadas",
      buildPayload: (partner) => ({
        businessPartnerId: partner.sapBusinessPartnerId ?? null,
        mdmPartnerId: partner.mdmPartnerId,
        partnerId: partner.id,
        document: partner.documento,
        roles: this.buildRoles(partner)
      })
    },
    banks: {
      method: "PUT",
      path: "/business-partners/banks",
      successMessage: "Bancos sincronizados",
      buildPayload: (partner) => ({
        businessPartnerId: partner.sapBusinessPartnerId ?? null,
        mdmPartnerId: partner.mdmPartnerId,
        partnerId: partner.id,
        document: partner.documento,
        banks: partner.banks
      })
    }
  };

  private buildRoles(partner: Partner): string[] {
    const roles: string[] = [];
    if (partner.natureza === "cliente" || partner.natureza === "ambos") {
      roles.push("CUSTOMER");
    }
    if (partner.natureza === "fornecedor" || partner.natureza === "ambos") {
      roles.push("VENDOR");
    }
    if (partner.transportadores?.length) {
      roles.push("TRANSPORTER");
    }
    return roles;
  }

  private async dispatchSegment(segment: SapIntegrationSegment, partner: Partner) {
    const config = this.segmentConfig[segment];
    if (!config) {
      throw new Error(`Segmento SAP desconhecido: ${segment}`);
    }
    const payload = config.buildPayload(partner);
    return this.callSap(config.method, config.path, payload);
  }

  private extractPartnerUpdates(segment: SapIntegrationSegment, response: any): Partial<Partner> {
    if (segment === "businessPartner") {
      const sapId = this.extractBusinessPartnerId(response);
      if (sapId) {
        return { sapBusinessPartnerId: sapId } as Partial<Partner>;
      }
    }
    return {};
  }

  private extractSegmentIdentifier(
    segment: SapIntegrationSegment,
    response: any,
    updates: Partial<Partner>
  ): string | null {
    if (segment === "businessPartner") {
      return (
        this.extractBusinessPartnerId(response) ||
        (updates.sapBusinessPartnerId ? String(updates.sapBusinessPartnerId) : null)
      );
    }
    return null;
  }

  private extractBusinessPartnerId(response: any): string | null {
    if (!response) return null;
    if (typeof response === "string" && response.trim()) {
      return response.trim();
    }
    const candidate =
      response?.businessPartnerId ??
      response?.BusinessPartner ??
      response?.bpId ??
      response?.id ??
      response?.sapId;
    if (candidate === undefined || candidate === null) {
      return null;
    }
    const value = String(candidate).trim();
    return value.length ? value : null;
  }

  private async callSap(method: "POST" | "PUT", path: string, body: any) {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const auth = this.authorizationHeader;
    if (auth) {
      headers.Authorization = auth;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(body ?? {}),
        signal: controller.signal
      });

      const raw = await response.text();
      let parsed: any = null;
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
      }

      if (!response.ok) {
        const message =
          typeof parsed === "string"
            ? parsed
            : parsed?.message ?? `SAP respondeu com status ${response.status}`;
        throw new Error(message);
      }

      return parsed;
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new Error("Tempo limite excedido ao comunicar com o SAP");
      }
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
