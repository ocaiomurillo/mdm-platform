import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { Brackets, In, Repository } from "typeorm";
import { CreatePartnerDto } from "./dto/create-partner.dto";
import {
  ChangeRequestFieldDto,
  ChangeRequestListQueryDto,
  CreateBulkChangeRequestDto,
  CreateChangeRequestDto
} from "./dto/change-request.dto";
import { Partner } from "./entities/partner.entity";
import { PartnerAuditJob } from "./entities/partner-audit-job.entity";
import { PartnerAuditLog } from "./entities/partner-audit-log.entity";
import { PartnerChangeRequest } from "./entities/partner-change-request.entity";
import { SapIntegrationService } from "./sap-integration.service";
import {
  changeRequestFieldDefinitions,
  ChangeRequestOrigin,
  ChangeRequestPayload,
  PartnerApprovalAction,
  PartnerApprovalHistoryEntry,
  PartnerApprovalStage
} from "@mdm/types";
import { onlyDigits, validateCNPJ, validateCPF } from "@mdm/utils";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name?: string | null;
  profile?: string | null;
  responsibilities?: string[];
};

const WORKFLOW_STAGES: PartnerApprovalStage[] = ["fiscal", "compras", "dados_mestres"];
const FINAL_STAGE: PartnerApprovalStage = "finalizado";
const STAGE_PERMISSION: Record<PartnerApprovalStage, string | null> = {
  fiscal: "partners.approval.fiscal",
  compras: "partners.approval.compras",
  dados_mestres: "partners.approval.dados_mestres",
  finalizado: null
};

@Injectable()
export class PartnersService {
  private readonly changeFieldMap = new Map(changeRequestFieldDefinitions.map((definition) => [definition.id, definition]));

  constructor(
    @InjectRepository(Partner) private readonly repo: Repository<Partner>,
    @InjectRepository(PartnerChangeRequest) private readonly changeRepo: Repository<PartnerChangeRequest>,
    @InjectRepository(PartnerAuditJob) private readonly auditJobRepo: Repository<PartnerAuditJob>,
    @InjectRepository(PartnerAuditLog) private readonly auditLogRepo: Repository<PartnerAuditLog>,
    private readonly sapIntegration: SapIntegrationService
  ) {}

  private getNextStage(current: PartnerApprovalStage): PartnerApprovalStage | null {
    const index = WORKFLOW_STAGES.indexOf(current);
    if (index === -1) {
      return null;
    }
    return WORKFLOW_STAGES[index + 1] ?? FINAL_STAGE;
  }

  private ensureUserCanHandleStage(stage: PartnerApprovalStage, user: AuthenticatedUser) {
    const requiredPermission = STAGE_PERMISSION[stage];
    if (!requiredPermission) {
      return;
    }
    const permissions = user?.responsibilities ?? [];
    if (!permissions.includes(requiredPermission)) {
      throw new ForbiddenException("Usuário não possui permissão para esta etapa.");
    }
  }

  private ensurePartnerStage(partner: Partner, stage: PartnerApprovalStage) {
    if (stage === FINAL_STAGE) {
      throw new BadRequestException("Etapa final não aceita ações diretas.");
    }
    if (partner.approvalStage !== stage) {
      throw new BadRequestException("Parceiro não está na etapa informada.");
    }
    if (partner.status !== "em_validacao") {
      throw new BadRequestException("Parceiro não está em validação.");
    }
  }

  private appendHistory(
    partner: Partner,
    stage: PartnerApprovalStage,
    action: PartnerApprovalAction,
    user: AuthenticatedUser,
    notes?: string
  ) {
    const history = Array.isArray(partner.approvalHistory) ? [...partner.approvalHistory] : [];
    const sanitized: PartnerApprovalHistoryEntry = {
      stage,
      action,
      performedBy: user?.id,
      performedByName: user?.name?.trim() || user?.email,
      notes,
      performedAt: new Date().toISOString()
    };
    history.push(sanitized);
    partner.approvalHistory = history;
  }

  async create(dto: CreatePartnerDto) {
    const documento = onlyDigits(dto.documento);
    const duplicate = await this.repo.findOne({ where: { documento } });
    if (duplicate) {
      throw new BadRequestException("Documento ja cadastrado");
    }

    const partner = this.repo.create({
      ...dto,
      sapBusinessPartnerId: (dto as any).sap_bp_id,
      status: "draft",
      approvalStage: "fiscal",
      approvalHistory: [],
      documento,
      comunicacao: dto.comunicacao ?? {},
      fornecedor_info: dto.fornecedor_info ?? {},
      vendas_info: dto.vendas_info ?? {},
      fiscal_info: dto.fiscal_info ?? {},
      transportadores: dto.transportadores ?? [],
      credito_info: dto.credito_info ?? {}
    });
    return this.repo.save(partner);
  }

  async findAll({ search, status }: { search?: string; status?: string }) {
    const qb = this.repo.createQueryBuilder("partner").orderBy("partner.nome_legal", "ASC");
    if (search?.trim()) {
      const normalizedSearch = `%${search.trim()}%`;
      qb.where("partner.nome_legal ILIKE :search", { search: normalizedSearch });
    }
    if (status) {
      qb.andWhere("partner.status = :status", { status });
    }
    return qb.getMany();
  }

  async search({ q, filters }: { q?: string; filters?: Record<string, string | string[]> }) {
    const qb = this.repo.createQueryBuilder("partner");

    if (q?.trim()) {
      const normalizedQuery = `%${q.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where("partner.nome_legal ILIKE :q", { q: normalizedQuery })
            .orWhere("partner.documento ILIKE :q", { q: normalizedQuery })
            .orWhere("partner.sap_bp_id ILIKE :q", { q: normalizedQuery })
            .orWhere("CAST(partner.mdm_partner_id AS TEXT) ILIKE :q", { q: normalizedQuery })
            .orWhere("partner.contato_principal::text ILIKE :q", { q: normalizedQuery })
            .orWhere("partner.comunicacao::text ILIKE :q", { q: normalizedQuery })
            .orWhere("partner.addresses::text ILIKE :q", { q: normalizedQuery });
        })
      );
    }

    if (filters) {
      Object.entries(filters).forEach(([key, raw]) => {
        if (raw === undefined || raw === null || raw === "") return;
        const values = Array.isArray(raw) ? raw.filter(Boolean) : [raw];
        if (!values.length) return;

        switch (key) {
          case "natureza":
            qb.andWhere("partner.natureza IN (:...naturezas)", { naturezas: values });
            break;
          case "status":
            qb.andWhere("partner.status IN (:...statuses)", { statuses: values });
            break;
          case "sap": {
            const wantsSap = values.includes("sim");
            const wantsMdm = values.includes("nao");
            if (wantsSap && !wantsMdm) qb.andWhere("partner.sap_bp_id IS NOT NULL");
            if (wantsMdm && !wantsSap) qb.andWhere("partner.sap_bp_id IS NULL");
            break;
          }
          case "uf":
            qb.andWhere(
              new Brackets((sub) => {
                values.forEach((value, index) => {
                  const paramKey = `uf_${index}`;
                  const normalizedUf = String(value).trim().toUpperCase();
                  if (!normalizedUf) return;
                  sub[index === 0 ? "where" : "orWhere"](
                    `partner.addresses::text ILIKE :${paramKey}`,
                    { [paramKey]: `%\"uf\":\"${normalizedUf}\"%` }
                  );
                });
              })
            );
            break;
          default:
            break;
        }
      });
    }

    qb.orderBy("partner.nome_legal", "ASC");
    return qb.getMany();
  }

  async findOne(id: string) {
    const partner = await this.repo.findOne({ where: { id } });
    if (!partner) {
      throw new NotFoundException("Partner not found");
    }
    return partner;
  }

  async getDetails(id: string) {
    const partner = await this.findOne(id);

    const changeRequests = await this.changeRepo.find({
      where: { partnerId: id },
      order: { createdAt: "DESC" },
      take: 20
    });

    const auditLogs = await this.auditLogRepo.find({
      where: { partnerId: id },
      relations: ["job"],
      order: { createdAt: "DESC" },
      take: 20
    });

    return { partner, changeRequests, auditLogs };
  }

  async createChangeRequest(partnerId: string, dto: CreateChangeRequestDto) {
    const motivo = dto.motivo?.trim();
    if (!motivo) {
      throw new BadRequestException("Informe o motivo da solicitacao");
    }

    const partner = await this.findOne(partnerId);
    const origin: ChangeRequestOrigin = dto.origin ?? "interno";

    const payload = this.buildChangeRequestPayload(partner, dto.fields, "individual", {
      motivo,
      origin,
      metadata: dto.metadata
    });

    const changeRequest = this.changeRepo.create({
      partnerId: partner.id,
      requestType: "individual",
      status: "pendente",
      motivo,
      payload,
      requestedBy: dto.requestedBy
    });

    const saved = await this.changeRepo.save(changeRequest);

    if (origin === "externo") {
      await this.registerExternalAudit(partner, saved);
    }

    return saved;
  }

  async createBulkChangeRequests(dto: CreateBulkChangeRequestDto) {
    const motivo = dto.motivo?.trim();
    if (!motivo) {
      throw new BadRequestException("Informe o motivo da solicitacao");
    }

    const ids = Array.from(new Set(dto.partnerIds ?? [])).filter(Boolean);
    if (!ids.length) {
      throw new BadRequestException("Informe ao menos um parceiro");
    }

    const partners = await this.repo.find({ where: { id: In(ids) } });
    if (!partners.length) {
      throw new NotFoundException("Nenhum parceiro encontrado");
    }

    const partnerMap = new Map(partners.map((item) => [item.id, item]));
    const missing = ids.filter((id) => !partnerMap.has(id));
    if (missing.length) {
      throw new NotFoundException(`Parceiros nao encontrados: ${missing.join(", ")}`);
    }

    const origin: ChangeRequestOrigin = dto.origin ?? "interno";
    const batchId = randomUUID();
    const responses: PartnerChangeRequest[] = [];

    for (const partnerId of ids) {
      const partner = partnerMap.get(partnerId)!;
      const payload = this.buildChangeRequestPayload(partner, dto.fields, "massa", {
        motivo,
        origin,
        metadata: dto.metadata,
        batchId
      });

      const changeRequest = this.changeRepo.create({
        partnerId,
        requestType: "massa",
        status: "pendente",
        motivo,
        payload,
        requestedBy: dto.requestedBy
      });

      const saved = await this.changeRepo.save(changeRequest);
      responses.push(saved);

      if (origin === "externo") {
        await this.registerExternalAudit(partner, saved);
      }
    }

    return { batchId, total: responses.length, requests: responses };
  }

  async listChangeRequests(partnerId: string, query: ChangeRequestListQueryDto) {
    await this.findOne(partnerId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Record<string, unknown> = { partnerId };
    if (query.status) {
      where.status = query.status;
    }
    if (query.requestType) {
      where.requestType = query.requestType;
    }

    const [items, total] = await this.changeRepo.findAndCount({
      where,
      order: { createdAt: "DESC" },
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize))
    };
  }

  async submit(id: string, user: AuthenticatedUser) {
    const partner = await this.findOne(id);
    if (!["draft", "rejeitado"].includes(partner.status)) {
      throw new BadRequestException("Somente rascunhos ou rejeitados podem ser enviados para validação.");
    }
    partner.status = "em_validacao";
    partner.approvalStage = "fiscal";
    this.appendHistory(partner, "fiscal", "submitted", user);
    return this.repo.save(partner);
  }

  async approveStage(id: string, stage: PartnerApprovalStage, user: AuthenticatedUser) {
    const partner = await this.findOne(id);
    this.ensurePartnerStage(partner, stage);
    this.ensureUserCanHandleStage(stage, user);
    this.appendHistory(partner, stage, "approved", user);

    const nextStage = this.getNextStage(stage);
    if (!nextStage || nextStage === FINAL_STAGE) {
      partner.approvalStage = FINAL_STAGE;
      partner.status = "aprovado";
      await this.repo.save(partner);
      return this.approve(partner.id);
    }

    partner.approvalStage = nextStage;
    partner.status = "em_validacao";

    return this.repo.save(partner);
  }

  async approve(id: string) {
    const partner = await this.findOne(id);
    if (partner.approvalStage !== FINAL_STAGE) {
      throw new BadRequestException("Parceiro não está na etapa final para aprovação");
    }

    const result = await this.sapIntegration.integratePartner(partner, {
      onStateChange: async (segments) => {
        partner.sap_segments = segments;
        await this.repo.update(partner.id, { sap_segments: segments });
      }
    });

    partner.sap_segments = result.segments;
    Object.entries(result.updates).forEach(([key, value]) => {
      if (value !== undefined) {
        (partner as any)[key] = value;
      }
    });

    partner.status = result.completed ? "integrado" : "aprovado";
    await this.repo.save(partner);
    return partner;
  }

  async retrySapIntegration(id: string) {
    const partner = await this.findOne(id);
    if (partner.approvalStage !== FINAL_STAGE) {
      throw new BadRequestException("Somente parceiros finalizados podem ser reenviados ao SAP");
    }

    const result = await this.sapIntegration.retry(partner, {
      onStateChange: async (segments) => {
        partner.sap_segments = segments;
        await this.repo.update(partner.id, { sap_segments: segments });
      }
    });

    partner.sap_segments = result.segments;
    Object.entries(result.updates).forEach(([key, value]) => {
      if (value !== undefined) {
        (partner as any)[key] = value;
      }
    });

    partner.status = result.completed ? "integrado" : "aprovado";
    await this.repo.save(partner);
    return partner;
  }

  async rejectStage(id: string, stage: PartnerApprovalStage, user: AuthenticatedUser, reason?: string) {
    const partner = await this.findOne(id);
    this.ensurePartnerStage(partner, stage);
    this.ensureUserCanHandleStage(stage, user);
    partner.status = "rejeitado";
    partner.approvalStage = stage;
    this.appendHistory(partner, stage, "rejected", user, reason);
    return this.repo.save(partner);
  }

  async requestAudit(partnerIds: string[], requestedBy?: string) {
    const ids = Array.from(new Set(partnerIds ?? [])).filter(Boolean);
    if (!ids.length) {
      throw new BadRequestException("Informe ao menos um parceiro");
    }

    const partners = await this.repo.find({ where: { id: In(ids) } });
    if (!partners.length) {
      throw new NotFoundException("Nenhum parceiro encontrado para auditoria");
    }

    const job = this.auditJobRepo.create({
      scope: ids.length === 1 ? "individual" : "massa",
      partnerIds: ids,
      status: "queued",
      requestedBy
    });
    await this.auditJobRepo.save(job);

    await this.processAuditJob(job.id);
    return this.getAuditJob(job.id);
  }

  async getAuditJob(jobId: string) {
    const job = await this.auditJobRepo.findOne({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException("Auditoria nao encontrada");
    }
    const logs = await this.auditLogRepo.find({
      where: { jobId },
      relations: ["partner"],
      order: { createdAt: "DESC" }
    });
    return { job, logs };
  }

  async lookupCnpj(rawCnpj: string) {
    const cnpj = onlyDigits(rawCnpj);
    if (!validateCNPJ(cnpj)) {
      throw new BadRequestException("CNPJ invalido");
    }

    const existing = await this.repo.findOne({ where: { documento: cnpj } });
    if (existing) {
      throw new BadRequestException("CNPJ ja cadastrado");
    }

    try {
      const payload = await this.fetchFromCnpja(cnpj);
      return this.normalizeCnpjPayload(payload);
    } catch (error) {
      throw new InternalServerErrorException("Nao foi possivel obter dados do CNPJ informado");
    }
  }

  async lookupCpf(rawCpf: string) {
    const cpf = onlyDigits(rawCpf);
    if (!validateCPF(cpf)) {
      throw new BadRequestException("CPF invalido");
    }

    const existing = await this.repo.findOne({ where: { documento: cpf } });
    if (existing) {
      throw new BadRequestException("CPF ja cadastrado");
    }

    return {
      raw: { cpf },
      documento: cpf
    };
  }

  private async processAuditJob(jobId: string) {
    const job = await this.auditJobRepo.findOne({ where: { id: jobId } });
    if (!job) return;

    await this.auditJobRepo.update(jobId, { status: "running", startedAt: new Date() });

    try {
      for (const partnerId of job.partnerIds) {
        try {
          const partner = await this.repo.findOne({ where: { id: partnerId } });
          if (!partner) {
            await this.auditLogRepo.save({
              jobId,
              partnerId,
              result: "erro",
              message: "Parceiro nao encontrado"
            });
            continue;
          }

          await this.auditLogRepo.save({
            jobId,
            partnerId,
            result: "ok",
            message: "Auditoria executada"
          });
        } catch (error) {
          await this.auditLogRepo.save({
            jobId,
            partnerId,
            result: "erro",
            message: error instanceof Error ? error.message : "Falha desconhecida"
          });
        }
      }

      await this.auditJobRepo.update(jobId, { status: "concluido", finishedAt: new Date() });
    } catch (error) {
      await this.auditJobRepo.update(jobId, {
        status: "erro",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : "Falha desconhecida"
      });
    }
  }

  private buildChangeRequestPayload(
    partner: Partner,
    fields: ChangeRequestFieldDto[],
    tipo: "individual" | "massa",
    options: { motivo: string; origin: ChangeRequestOrigin; metadata?: Record<string, any>; batchId?: string }
  ): ChangeRequestPayload {
    return {
      tipo,
      motivo: options.motivo,
      origin: options.origin,
      batchId: options.batchId,
      metadata: options.metadata,
      partners: [
        {
          partnerId: partner.id,
          partnerName: partner.nome_legal,
          document: partner.documento,
          changes: this.mapFieldChanges(partner, fields)
        }
      ]
    };
  }

  private mapFieldChanges(partner: Partner, fields: ChangeRequestFieldDto[]) {
    return fields.map((field) => {
      const key = field.field as typeof changeRequestFieldDefinitions[number]["id"];
      const definition = this.changeFieldMap.get(key);
      if (!definition) {
        throw new BadRequestException(`Campo "${field.field}" nao e suportado para solicitacao de alteracao.`);
      }
      const previousValue = this.resolvePartnerFieldValue(partner, definition.path);
      return {
        field: field.field,
        label: field.label ?? definition.label,
        previousValue,
        newValue: field.newValue ?? null
      };
    });
  }

  private async fetchFromCnpja(cnpj: string) {
    const baseUrl = process.env.CNPJ_OPEN_API_URL || "https://cnpja.com/api";
    const token = process.env.CNPJ_OPEN_API_TOKEN;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/cnpj/${cnpj}`, { headers });
    if (!response.ok) {
      throw new Error(`cnpja responded with status ${response.status}`);
    }
    return response.json();
  }

  private normalizeCnpjPayload(payload: any) {
    const establishment = payload?.establishment_principal || payload?.establishments?.find((est: any) => est?.principal) || payload?.establishments?.[0] || {};
    const address = establishment?.endereco || {};
    const city = address?.municipio || {};

    const pick = (...sources: Array<string | number | null | undefined>) => {
      for (const value of sources) {
        if (value === undefined || value === null) continue;
        const normalized = value.toString().trim();
        if (normalized.length) return normalized;
      }
      return "";
    };

    const inscricoes = establishment?.inscricoes_estaduais ?? payload?.inscricoes_estaduais ?? [];
    const primeiraInscricao = inscricoes.find((item: any) => item?.numero) || {};
    const beneficios = establishment?.beneficios || establishment?.beneficios_fiscais || [];
    const zonaFrancaBeneficios = beneficios.map((benef: any) => benef?.descricao || benef?.nome || benef).filter(Boolean);

    return {
      raw: payload,
      documento: pick(payload?.cnpj, payload?.numero_identificacao),
      nome_legal: pick(payload?.razao_social, payload?.nome),
      nome_fantasia: pick(payload?.nome_fantasia, establishment?.nome_fantasia),
      regime_tributario: pick(payload?.regime_tributario?.descricao, payload?.regime_tributario),
      simples: {
        optante: Boolean(payload?.simples?.optante),
        desde: payload?.simples?.data_opcao || null,
        ate: payload?.simples?.data_exclusao || null,
        situacao: pick(payload?.simples?.situacao)
      },
      inscricao_estadual: pick(primeiraInscricao?.numero, establishment?.inscricao_estadual),
      inscricoes_estaduais: inscricoes.map((item: any) => ({
        numero: pick(item?.numero, item?.inscricao),
        uf: pick(item?.uf, item?.estado).toUpperCase()
      })),
      suframa: pick(establishment?.suframa?.codigo, payload?.suframa?.codigo, payload?.suframa),
      beneficios_zona_franca: zonaFrancaBeneficios,
      contato: {
        email: pick(establishment?.email, payload?.email),
        telefone: pick(establishment?.telefone1, establishment?.telefone2, establishment?.telefone, payload?.telefone)
      },
      endereco: {
        cep: pick(address?.cep, address?.codigo_cep).replace(/\D+/g, ""),
        logradouro: pick(address?.logradouro, address?.tipo_logradouro),
        numero: pick(address?.numero),
        complemento: pick(address?.complemento),
        bairro: pick(address?.bairro),
        municipio: pick(city?.nome, address?.municipio, address?.cidade).toUpperCase(),
        municipio_ibge: pick(address?.codigo_municipio_ibge, city?.codigo_ibge),
        uf: pick(address?.uf, address?.estado).toUpperCase().slice(0, 2)
      },
      fiscal: {
        enquadramento: pick(payload?.natureza_juridica?.descricao),
        porte: pick(payload?.porte?.descricao),
        zona_franca: zonaFrancaBeneficios.length > 0
      }
    };
  }

  private resolvePartnerFieldValue(partner: Partner, path: string) {
    return path.split(".").reduce<any>((acc, segment) => {
      if (acc === undefined || acc === null) {
        return undefined;
      }
      return acc[segment];
    }, partner as any);
  }

  private async registerExternalAudit(partner: Partner, changeRequest: PartnerChangeRequest) {
    const job = this.auditJobRepo.create({
      scope: "individual",
      partnerIds: [partner.id],
      status: "registrado",
      requestedBy: changeRequest.requestedBy ?? "externo"
    });
    await this.auditJobRepo.save(job);

    await this.auditLogRepo.save({
      jobId: job.id,
      partnerId: partner.id,
      result: "inconsistente",
      differences: changeRequest.payload,
      message: `Solicitacao externa de alteracao ${changeRequest.id}`
    });
  }
}

