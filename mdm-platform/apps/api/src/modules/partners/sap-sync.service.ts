import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Partner } from "./entities/partner.entity";
import { PartnerAuditLog } from "./entities/partner-audit-log.entity";
import { PartnerAuditJob } from "./entities/partner-audit-job.entity";
import { Repository } from "typeorm";
import { mapSapPartnerPayload, SapPartnerPayload, SapPartnerUpdate } from "./sap-sync.mapper";
import { PartnerAuditDifference } from "@mdm/types";
import { onlyDigits } from "@mdm/utils";

const SAP_SYNC_CRON = process.env.SAP_SYNC_CRON ?? CronExpression.EVERY_HOUR;

export type SapSyncSummary = {
  fetched: number;
  updated: number;
  skipped: number;
  errors: number;
};

type SyncContext = {
  job: PartnerAuditJob | null;
  partnerIds: Set<string>;
};

@Injectable()
export class SapSyncService {
  private readonly logger = new Logger(SapSyncService.name);

  constructor(
    @InjectRepository(Partner) private readonly partnerRepo: Repository<Partner>,
    @InjectRepository(PartnerAuditLog) private readonly auditLogRepo: Repository<PartnerAuditLog>,
    @InjectRepository(PartnerAuditJob) private readonly auditJobRepo: Repository<PartnerAuditJob>
  ) {}

  @Cron(SAP_SYNC_CRON)
  async handleCron() {
    if (!this.isEnabled()) {
      return;
    }
    try {
      const summary = await this.syncPartners();
      this.logger.log(
        `Sincronização SAP concluída. Fetched=${summary.fetched} updated=${summary.updated} skipped=${summary.skipped} errors=${summary.errors}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Erro na sincronização com o SAP: ${message}`, error instanceof Error ? error.stack : undefined);
    }
  }

  async syncPartners(): Promise<SapSyncSummary> {
    if (!this.isEnabled()) {
      this.logger.debug("Sincronização SAP desativada (SAP_SYNC_ENABLED=false)");
      return { fetched: 0, updated: 0, skipped: 0, errors: 0 };
    }

    if (!this.isConfigured()) {
      this.logger.warn("Configuração do SAP incompleta. Defina SAP_BASE_URL, SAP_USER e SAP_PASSWORD.");
      return { fetched: 0, updated: 0, skipped: 0, errors: 0 };
    }

    const summary: SapSyncSummary = { fetched: 0, updated: 0, skipped: 0, errors: 0 };
    const context: SyncContext = { job: null, partnerIds: new Set() };
    const pageSize = this.pageSize;

    let page = 1;
    let keepFetching = true;

    while (keepFetching) {
      const response = await this.fetchPartnerPage(page, pageSize).catch((error) => {
        summary.errors += 1;
        throw error;
      });

      const items = this.extractItems(response);
      if (!items.length && page === 1) {
        break;
      }

      for (const payload of items) {
        summary.fetched += 1;
        try {
          const processed = await this.processPartnerPayload(payload, context);
          if (processed) {
            summary.updated += 1;
          } else {
            summary.skipped += 1;
          }
        } catch (error) {
          summary.errors += 1;
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Erro ao processar payload SAP: ${message}`, error instanceof Error ? error.stack : undefined);
        }
      }

      keepFetching = this.hasNextPage(response, items.length, pageSize, page);
      page += 1;
    }

    if (context.job) {
      await this.auditJobRepo.update(context.job.id, {
        status: "concluido",
        finishedAt: new Date(),
        partnerIds: Array.from(context.partnerIds)
      });
    }

    return summary;
  }

  private async processPartnerPayload(payload: SapPartnerPayload, context: SyncContext): Promise<boolean> {
    const updates = mapSapPartnerPayload(payload);
    if (!Object.keys(updates).length) {
      return false;
    }

    const partner = await this.findPartner(payload);
    if (!partner) {
      this.logger.warn(
        `Parceiro não encontrado para o payload do SAP. Chaves: partnerId=${payload.partnerId ?? payload.id} document=${payload.document}`
      );
      return false;
    }

    const differences = this.calculateDifferences(partner, updates);
    if (!differences.length) {
      return false;
    }

    this.partnerRepo.merge(partner, updates);
    await this.partnerRepo.save(partner);

    context.partnerIds.add(partner.id);
    const job = await this.ensureJob(context);

    await this.auditLogRepo.save({
      jobId: job.id,
      partnerId: partner.id,
      result: "ok",
      differences,
      message: "Cadastro atualizado a partir do SAP",
      externalData: {
        source: "sap",
        fetchedAt: new Date().toISOString(),
        payload
      }
    });

    return true;
  }

  private async ensureJob(context: SyncContext): Promise<PartnerAuditJob> {
    if (context.job) {
      return context.job;
    }

    const now = new Date();
    const job = this.auditJobRepo.create({
      scope: "massa",
      status: "running",
      partnerIds: [],
      requestedBy: "sap-sync",
      startedAt: now
    });
    context.job = await this.auditJobRepo.save(job);
    return context.job;
  }

  private calculateDifferences(partner: Partner, updates: SapPartnerUpdate): PartnerAuditDifference[] {
    const differences: PartnerAuditDifference[] = [];
    for (const [field, after] of Object.entries(updates)) {
      const before = (partner as any)[field];
      if (this.areValuesEqual(before, after)) {
        continue;
      }
      differences.push({
        field,
        label: this.getFieldLabel(field),
        before: this.cloneValue(before),
        after: this.cloneValue(after),
        source: "external",
        metadata: {
          sourceSystem: "sap",
          field
        }
      });
    }
    return differences;
  }

  private cloneValue(value: any) {
    if (value === undefined) {
      return null;
    }
    return JSON.parse(JSON.stringify(value));
  }

  private getFieldLabel(field: string): string {
    const labels: Record<string, string> = {
      sapBusinessPartnerId: "SAP Business Partner ID",
      sap_segments: "Segmentos SAP",
      addresses: "Endereços",
      banks: "Bancos",
      contato_principal: "Contato principal",
      comunicacao: "Comunicação",
      fornecedor_info: "Informações de fornecedor",
      vendas_info: "Informações de vendas",
      fiscal_info: "Informações fiscais",
      transportadores: "Transportadores",
      credito_info: "Informações de crédito",
      nome_legal: "Nome legal",
      nome_fantasia: "Nome fantasia",
      documento: "Documento",
      natureza: "Natureza",
      tipo_pessoa: "Tipo de pessoa",
      status: "Status"
    };
    return labels[field] ?? field;
  }

  private areValuesEqual(before: any, after: any): boolean {
    const normalize = (value: any) => {
      if (value === null || value === undefined) return null;
      return JSON.parse(JSON.stringify(value));
    };

    return JSON.stringify(normalize(before)) === JSON.stringify(normalize(after));
  }

  private async findPartner(payload: SapPartnerPayload): Promise<Partner | null> {
    const identifiers: Array<[string, any]> = [];
    if (payload.partnerId || payload.id) {
      identifiers.push(["id", payload.partnerId ?? payload.id]);
    }
    if (payload.mdmPartnerId) {
      identifiers.push(["mdmPartnerId", Number(payload.mdmPartnerId)]);
    }
    const sapId =
      payload.sapBusinessPartnerId ?? payload.sapId ?? payload.businessPartnerId;
    if (sapId) {
      identifiers.push(["sapBusinessPartnerId", String(sapId)]);
    }
    if (payload.document) {
      identifiers.push(["documento", onlyDigits(String(payload.document))]);
    }

    for (const [field, value] of identifiers) {
      if (value === undefined || value === null || value === "") {
        continue;
      }
      const partner = await this.partnerRepo.findOne({ where: { [field]: value } as any });
      if (partner) {
        return partner;
      }
    }

    return null;
  }

  private async fetchPartnerPage(page: number, pageSize: number): Promise<any> {
    const url = new URL(`${this.baseUrl}/business-partners`);
    url.searchParams.set("page", String(page));
    url.searchParams.set("pageSize", String(pageSize));
    const updatedAfter = this.updatedAfter;
    if (updatedAfter) {
      url.searchParams.set("updatedAfter", updatedAfter);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout ?? 15000);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        headers: this.buildHeaders(),
        signal: controller.signal
      });

      if (!response.ok) {
        const raw = await response.text();
        throw new Error(raw || `SAP respondeu com status ${response.status}`);
      }

      return response.json();
    } catch (error: any) {
      if (error?.name === "AbortError") {
        throw new Error("Tempo limite excedido ao consultar o SAP");
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private extractItems(response: any): SapPartnerPayload[] {
    if (!response) return [];
    if (Array.isArray(response)) {
      return response as SapPartnerPayload[];
    }
    if (Array.isArray(response.items)) {
      return response.items as SapPartnerPayload[];
    }
    if (Array.isArray(response.data)) {
      return response.data as SapPartnerPayload[];
    }
    return [];
  }

  private hasNextPage(response: any, itemCount: number, pageSize: number, currentPage: number): boolean {
    const pagination = response?.pagination ?? {};
    if (typeof pagination.nextPage === "number") {
      return pagination.nextPage > currentPage;
    }
    if (typeof pagination.hasNext === "boolean") {
      return pagination.hasNext;
    }
    if (typeof pagination.totalPages === "number" && typeof pagination.page === "number") {
      return pagination.page < pagination.totalPages;
    }
    return itemCount === pageSize;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json" };
    const auth = this.authorizationHeader;
    if (auth) {
      headers.Authorization = auth;
    }
    return headers;
  }

  private isEnabled(): boolean {
    return process.env.SAP_SYNC_ENABLED !== "false";
  }

  private isConfigured(): boolean {
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

  private get pageSize(): number {
    const raw = process.env.SAP_SYNC_PAGE_SIZE;
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
  }

  private get updatedAfter(): string | null {
    return process.env.SAP_SYNC_UPDATED_AFTER || null;
  }

  private get timeout(): number | null {
    const raw = process.env.SAP_REQUEST_TIMEOUT;
    if (!raw) return 15000;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
  }

  private get authorizationHeader(): string | null {
    if (!this.user && !this.password) {
      return null;
    }
    const token = Buffer.from(`${this.user}:${this.password}`).toString("base64");
    return `Basic ${token}`;
  }
}

