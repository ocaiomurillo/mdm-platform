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
import { PartnerNote } from "./entities/partner-note.entity";
import { CreatePartnerNoteDto } from "./dto/partner-note.dto";
import { SapIntegrationService, SAP_INTEGRATION_SEGMENTS } from "./sap-integration.service";
import {
  changeRequestFieldDefinitions,
  ChangeRequestOrigin,
  ChangeRequestPayload,
  PartnerAuditDifference,
  PartnerApprovalAction,
  PartnerApprovalHistoryEntry,
  PartnerApprovalStage,
  PartnerRegistrationProgress,
  PartnerRegistrationStep,
  PartnerRegistrationStepStatus,
  SapIntegrationSegment,
  SapIntegrationSegmentState
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

const SAP_SEGMENTS: SapIntegrationSegment[] = [...SAP_INTEGRATION_SEGMENTS];
const BUSINESS_PARTNER_SEGMENT: SapIntegrationSegment = "businessPartner";

type AuditFieldMapping = {
  field: string;
  label: string;
  partnerPath: string;
  externalPath: string;
  partnerTransform?: (value: any) => any;
  externalTransform?: (value: any) => any;
};

const trimValue = (value: any) => (typeof value === "string" ? value.trim() : value);
const toLower = (value: any) => (typeof value === "string" ? value.trim().toLowerCase() : value);
const toUpper = (value: any) => (typeof value === "string" ? value.trim().toUpperCase() : value);
const toDigits = (value: any) => (typeof value === "string" ? value.replace(/\D+/g, "") : value);

const AUDIT_FIELD_MAPPINGS: AuditFieldMapping[] = [
  { field: "documento", label: "Documento", partnerPath: "documento", externalPath: "documento", partnerTransform: toDigits, externalTransform: toDigits },
  { field: "nome_legal", label: "Nome legal", partnerPath: "nome_legal", externalPath: "nome_legal", partnerTransform: trimValue, externalTransform: trimValue },
  { field: "nome_fantasia", label: "Nome fantasia", partnerPath: "nome_fantasia", externalPath: "nome_fantasia", partnerTransform: trimValue, externalTransform: trimValue },
  { field: "regime_tributario", label: "Regime tributário", partnerPath: "regime_tributario", externalPath: "regime_tributario", partnerTransform: trimValue, externalTransform: trimValue },
  {
    field: "contato_principal.email",
    label: "Contato - email",
    partnerPath: "contato_principal.email",
    externalPath: "contato.email",
    partnerTransform: toLower,
    externalTransform: toLower
  },
  {
    field: "contato_principal.fone",
    label: "Contato - telefone",
    partnerPath: "contato_principal.fone",
    externalPath: "contato.telefone",
    partnerTransform: toDigits,
    externalTransform: toDigits
  },
  {
    field: "addresses.0.cep",
    label: "Endereço - CEP",
    partnerPath: "addresses.0.cep",
    externalPath: "endereco.cep",
    partnerTransform: toDigits,
    externalTransform: toDigits
  },
  {
    field: "addresses.0.logradouro",
    label: "Endereço - Logradouro",
    partnerPath: "addresses.0.logradouro",
    externalPath: "endereco.logradouro",
    partnerTransform: trimValue,
    externalTransform: trimValue
  },
  {
    field: "addresses.0.numero",
    label: "Endereço - Número",
    partnerPath: "addresses.0.numero",
    externalPath: "endereco.numero",
    partnerTransform: trimValue,
    externalTransform: trimValue
  },
  {
    field: "addresses.0.complemento",
    label: "Endereço - Complemento",
    partnerPath: "addresses.0.complemento",
    externalPath: "endereco.complemento",
    partnerTransform: trimValue,
    externalTransform: trimValue
  },
  {
    field: "addresses.0.bairro",
    label: "Endereço - Bairro",
    partnerPath: "addresses.0.bairro",
    externalPath: "endereco.bairro",
    partnerTransform: trimValue,
    externalTransform: trimValue
  },
  {
    field: "addresses.0.municipio",
    label: "Endereço - Município",
    partnerPath: "addresses.0.municipio",
    externalPath: "endereco.municipio",
    partnerTransform: trimValue,
    externalTransform: trimValue
  },
  {
    field: "addresses.0.uf",
    label: "Endereço - UF",
    partnerPath: "addresses.0.uf",
    externalPath: "endereco.uf",
    partnerTransform: toUpper,
    externalTransform: toUpper
  },
  { field: "ie", label: "Inscrição estadual", partnerPath: "ie", externalPath: "inscricao_estadual", partnerTransform: trimValue, externalTransform: trimValue },
  { field: "suframa", label: "SUFRAMA", partnerPath: "suframa", externalPath: "suframa", partnerTransform: trimValue, externalTransform: trimValue }
];

type AuditComparisonSegment = {
  differences: PartnerAuditDifference[];
  externalData?: any;
};

@Injectable()
export class PartnersService {
  private readonly changeFieldMap = new Map(changeRequestFieldDefinitions.map((definition) => [definition.id, definition]));

  constructor(
    @InjectRepository(Partner) private readonly repo: Repository<Partner>,
    @InjectRepository(PartnerChangeRequest) private readonly changeRepo: Repository<PartnerChangeRequest>,
    @InjectRepository(PartnerAuditJob) private readonly auditJobRepo: Repository<PartnerAuditJob>,
    @InjectRepository(PartnerAuditLog) private readonly auditLogRepo: Repository<PartnerAuditLog>,
    @InjectRepository(PartnerNote) private readonly noteRepo: Repository<PartnerNote>,
    private readonly sapIntegration: SapIntegrationService
  ) {}

  private readonly recentNoteWindowMs = 7 * 24 * 60 * 60 * 1000;

  private getRecentNotesThreshold(): Date {
    const threshold = new Date();
    threshold.setTime(threshold.getTime() - this.recentNoteWindowMs);
    return threshold;
  }

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

  private parseSapSegment(segment: string): SapIntegrationSegment {
    const normalized = (segment ?? "").toString().trim().toLowerCase();
    const match = SAP_SEGMENTS.find((item) => item.toLowerCase() === normalized);
    if (!match) {
      throw new BadRequestException("Segmento SAP inválido.");
    }
    return match;
  }

  private isFullyIntegrated(states: SapIntegrationSegmentState[]): boolean {
    if (!Array.isArray(states) || !states.length) {
      return false;
    }
    return SAP_SEGMENTS.every((segment) => {
      const current = states.find((state) => state.segment === segment);
      return current?.status === "success";
    });
  }

  private hasValue(value: unknown): boolean {
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === "string") {
      return value.trim().length > 0;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return true;
    }
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (typeof value === "object") {
      return Object.values(value as Record<string, unknown>).some((item) => this.hasValue(item));
    }
    return false;
  }

  private evaluateRequiredFields(
    fields: Array<{ label: string; value: unknown; required?: boolean }>
  ): {
    missing: string[];
    status: PartnerRegistrationStepStatus;
    completedItems: number;
    totalItems: number;
  } {
    const totalItems = fields.length;
    const requiredFields = fields.filter((field) => field.required !== false);
    const optionalFields = fields.filter((field) => field.required === false);

    const missing = requiredFields
      .filter((field) => !this.hasValue(field.value))
      .map((field) => field.label);

    const completedRequired = requiredFields.length - missing.length;
    const completedOptional = optionalFields.filter((field) => this.hasValue(field.value)).length;
    const completedItems = completedRequired + completedOptional;

    let status: PartnerRegistrationStepStatus = "pending";
    if (totalItems === 0) {
      status = "pending";
    } else if (missing.length === 0) {
      status = "complete";
    } else if (completedItems > 0) {
      status = "in_progress";
    }

    return {
      missing,
      status,
      completedItems,
      totalItems
    };
  }

  private calculateRegistrationProgress(partner: Partner): PartnerRegistrationProgress {
    const steps: PartnerRegistrationStep[] = [];

    const basicResult = this.evaluateRequiredFields([
      { label: "Tipo de pessoa", value: partner.tipo_pessoa },
      { label: "Natureza", value: partner.natureza },
      { label: "Nome legal", value: partner.nome_legal }
    ]);

    steps.push({
      id: "basicData",
      label: "Dados básicos",
      status: basicResult.status,
      completedItems: basicResult.completedItems,
      totalItems: basicResult.totalItems,
      missing: basicResult.missing
    });

    const documentLabel = partner.tipo_pessoa === "PJ" ? "CNPJ" : "CPF";
    const documentsResult = this.evaluateRequiredFields([
      { label: documentLabel, value: partner.documento },
      { label: "Inscrição estadual", value: partner.ie, required: false },
      { label: "Inscrição municipal", value: partner.im, required: false },
      { label: "SUFRAMA", value: partner.suframa, required: false }
    ]);

    steps.push({
      id: "documents",
      label: "Documentos",
      status: documentsResult.status,
      completedItems: documentsResult.completedItems,
      totalItems: documentsResult.totalItems,
      missing: documentsResult.missing
    });

    const contactsResult = this.evaluateRequiredFields([
      { label: "Nome do contato principal", value: partner.contato_principal?.nome },
      { label: "E-mail do contato principal", value: partner.contato_principal?.email },
      { label: "Telefone principal", value: partner.contato_principal?.fone, required: false },
      { label: "Telefone comercial", value: partner.comunicacao?.telefone, required: false },
      { label: "Celular", value: partner.comunicacao?.celular, required: false },
      { label: "E-mails de comunicação", value: partner.comunicacao?.emails, required: false }
    ]);

    steps.push({
      id: "contacts",
      label: "Contatos",
      status: contactsResult.status,
      completedItems: contactsResult.completedItems,
      totalItems: contactsResult.totalItems,
      missing: contactsResult.missing
    });

    const addresses = Array.isArray(partner.addresses) ? partner.addresses : [];
    const primaryAddress = addresses[0] ?? null;
    const addressComplete =
      primaryAddress &&
      this.hasValue((primaryAddress as any)?.cep) &&
      this.hasValue((primaryAddress as any)?.logradouro) &&
      this.hasValue((primaryAddress as any)?.numero) &&
      this.hasValue((primaryAddress as any)?.bairro) &&
      (this.hasValue((primaryAddress as any)?.municipio) || this.hasValue((primaryAddress as any)?.municipio_ibge)) &&
      this.hasValue((primaryAddress as any)?.uf);

    steps.push({
      id: "addresses",
      label: "Endereços",
      status: addressComplete ? "complete" : addresses.length > 0 ? "in_progress" : "pending",
      completedItems: addressComplete ? 1 : 0,
      totalItems: 1,
      missing: addressComplete
        ? []
        : [addresses.length ? "Endereço principal incompleto" : "Cadastrar endereço principal"]
    });

    const banks = Array.isArray(partner.banks) ? partner.banks : [];
    const validBank = banks.find(
      (bank) =>
        this.hasValue((bank as any)?.banco) &&
        this.hasValue((bank as any)?.agencia) &&
        this.hasValue((bank as any)?.conta)
    );

    steps.push({
      id: "banks",
      label: "Dados bancários",
      status: validBank ? "complete" : banks.length > 0 ? "in_progress" : "pending",
      completedItems: validBank ? 1 : 0,
      totalItems: 1,
      missing: validBank
        ? []
        : [banks.length ? "Dados bancários incompletos" : "Adicionar dados bancários"]
    });

    const segments = Array.isArray(partner.sap_segments) ? partner.sap_segments : [];
    const segmentMap = new Map(segments.map((segment) => [segment.segment, segment]));
    let completedSegments = 0;
    let hasSegmentActivity = false;
    let hasSegmentError = false;

    for (const segment of SAP_SEGMENTS) {
      const current = segmentMap.get(segment);
      if (!current) {
        continue;
      }
      hasSegmentActivity = true;
      if (current.status === "success") {
        completedSegments += 1;
      }
      if (current.status === "error") {
        hasSegmentError = true;
      }
      if (current.status === "processing" || current.status === "pending") {
        hasSegmentActivity = true;
      }
    }

    let integrationStatus: PartnerRegistrationStepStatus = "pending";
    if (SAP_SEGMENTS.length && completedSegments === SAP_SEGMENTS.length) {
      integrationStatus = "complete";
    } else if (hasSegmentActivity || segments.length) {
      integrationStatus = hasSegmentError ? "in_progress" : "in_progress";
    }

    const integrationMissing: string[] = [];
    if (integrationStatus !== "complete") {
      integrationMissing.push(hasSegmentError ? "Reprocessar integração SAP" : "Integração SAP pendente");
    }

    steps.push({
      id: "integrations",
      label: "Integrações",
      status: integrationStatus,
      completedItems: completedSegments,
      totalItems: SAP_SEGMENTS.length,
      missing: integrationMissing
    });

    let approvalsStatus: PartnerRegistrationStepStatus = "pending";
    if (partner.status === "rejeitado") {
      approvalsStatus = "blocked";
    } else if (
      partner.approvalStage === "finalizado" ||
      partner.status === "aprovado" ||
      partner.status === "integrado"
    ) {
      approvalsStatus = "complete";
    } else if (partner.status === "em_validacao") {
      approvalsStatus = "in_progress";
    }

    steps.push({
      id: "approvals",
      label: "Fluxo de aprovação",
      status: approvalsStatus,
      completedItems: approvalsStatus === "complete" ? 1 : 0,
      totalItems: 1,
      missing:
        approvalsStatus === "complete"
          ? []
          : approvalsStatus === "blocked"
            ? ["Fluxo rejeitado - reenviar para validação"]
            : ["Aprovação pendente"]
    });

    const completedSteps = steps.filter((step) => step.status === "complete").length;
    const totalSteps = steps.length;

    let overallStatus: PartnerRegistrationProgress["overallStatus"] = "pending";
    if (steps.some((step) => step.status === "blocked")) {
      overallStatus = "blocked";
    } else if (totalSteps > 0 && completedSteps === totalSteps) {
      overallStatus = "complete";
    } else if (steps.some((step) => step.status === "in_progress") || completedSteps > 0) {
      overallStatus = "in_progress";
    }

    const completionPercentage = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

    return {
      steps,
      completedSteps,
      totalSteps,
      completionPercentage,
      overallStatus
    };
  }

  private async runSapIntegration(
    partner: Partner,
    segments?: SapIntegrationSegment[],
    options: { useRetry?: boolean; updateStatus?: boolean } = {}
  ) {
    const { useRetry = false, updateStatus = false } = options;

    const handler = useRetry
      ? this.sapIntegration.retry.bind(this.sapIntegration)
      : this.sapIntegration.integratePartner.bind(this.sapIntegration);

    const result = await handler(partner, {
      segments,
      onStateChange: async (states) => {
        partner.sap_segments = states;
        await this.repo.update(partner.id, { sap_segments: states });
      }
    });

    partner.sap_segments = result.segments;
    Object.entries(result.updates).forEach(([key, value]) => {
      if (value !== undefined) {
        (partner as any)[key] = value;
      }
    });

    if (updateStatus) {
      partner.status = this.isFullyIntegrated(partner.sap_segments) ? "integrado" : "aprovado";
    }

    return this.repo.save(partner);
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

    const recentNotesThreshold = this.getRecentNotesThreshold();

    qb.loadRelationCountAndMap(
      "partner.recentNotesCount",
      "partner.notes",
      "recentNote",
      (subQb) => subQb.where("recentNote.createdAt >= :recentNotesThreshold", { recentNotesThreshold })
    );

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

    const registrationProgress = this.calculateRegistrationProgress(partner);

    const notes = await this.noteRepo.find({
      where: { partnerId: id },
      order: { createdAt: "DESC" },
      take: 10
    });

    return { partner, changeRequests, auditLogs, registrationProgress, notes };
  }

  async listNotes(partnerId: string) {
    await this.findOne(partnerId);

    return this.noteRepo.find({
      where: { partnerId },
      order: { createdAt: "DESC" },
      take: 50
    });
  }

  async createNote(partnerId: string, dto: CreatePartnerNoteDto, user: AuthenticatedUser) {
    const content = dto.content?.trim();
    if (!content) {
      throw new BadRequestException("Informe o conteúdo da nota");
    }

    await this.findOne(partnerId);

    const note = this.noteRepo.create({
      partnerId,
      content,
      createdById: user?.id,
      createdByName: user?.name ?? user?.email ?? null
    });

    return this.noteRepo.save(note);
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
    return this.runSapIntegration(partner, [BUSINESS_PARTNER_SEGMENT]);
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
    return this.runSapIntegration(partner, undefined, { useRetry: true, updateStatus: true });
  }

  async retrySapIntegration(id: string) {
    const partner = await this.findOne(id);
    if (partner.approvalStage !== FINAL_STAGE) {
      throw new BadRequestException("Somente parceiros finalizados podem ser reenviados ao SAP");
    }
    return this.runSapIntegration(partner, undefined, { useRetry: true, updateStatus: true });
  }

  async triggerSapIntegrationSegment(id: string, segment: string) {
    const partner = await this.findOne(id);
    if (partner.approvalStage !== FINAL_STAGE) {
      throw new BadRequestException("Somente parceiros finalizados podem ser reenviados ao SAP");
    }
    const normalized = this.parseSapSegment(segment);
    return this.runSapIntegration(partner, [normalized], { useRetry: true, updateStatus: true });
  }

  async rejectStage(id: string, stage: PartnerApprovalStage, user: AuthenticatedUser, reason?: string) {
    const partner = await this.findOne(id);
    this.ensurePartnerStage(partner, stage);
    this.ensureUserCanHandleStage(stage, user);
    partner.status = "rejeitado";
    partner.approvalStage = stage;
    this.appendHistory(partner, stage, "rejected", user, reason);
    const rejectionMessage = reason?.trim()
      ? `Integração cancelada: parceiro rejeitado (${reason.trim()})`
      : "Integração cancelada: parceiro rejeitado no fluxo de aprovação.";
    partner.sap_segments = this.sapIntegration.markSegmentsAsError(partner, rejectionMessage);
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

  private async buildAuditComparison(partner: Partner) {
    const differences: PartnerAuditDifference[] = [];
    const dataSources: any[] = [];
    let hasReference = false;
    const warnings: string[] = [];

    const externalComparison = await this.compareWithExternalSource(partner).catch((error) => {
      warnings.push(error instanceof Error ? error.message : String(error));
      return null;
    });

    if (externalComparison) {
      hasReference = true;
      differences.push(...externalComparison.differences);
      if (externalComparison.externalData) {
        dataSources.push(externalComparison.externalData);
      }
    }

    if (!differences.length) {
      const changeComparison = await this.compareWithChangeRequests(partner);
      if (changeComparison) {
        hasReference = true;
        differences.push(...changeComparison.differences);
        if (changeComparison.externalData) {
          dataSources.push(changeComparison.externalData);
        }
      }
    }

    const externalData =
      dataSources.length === 0 ? null : dataSources.length === 1 ? dataSources[0] : { sources: dataSources };

    let result: "ok" | "inconsistente" | "erro" = "ok";
    let message = "Nenhuma diferença identificada.";

    if (differences.length) {
      result = "inconsistente";
      message = "Diferenças encontradas entre o cadastro e a fonte de referência.";
      if (warnings.length) {
        message += ` Observações: ${warnings.join("; ")}.`;
      }
    } else if (!hasReference) {
      result = "erro";
      message = warnings.length
        ? `Não foi possível obter dados para comparação: ${warnings.join("; ")}`
        : "Nenhuma fonte de comparação disponível para este parceiro.";
    } else if (warnings.length) {
      message = `Auditoria concluída sem diferenças. Observações: ${warnings.join("; ")}.`;
    }

    return { differences, externalData, result, message };
  }

  private async compareWithExternalSource(partner: Partner): Promise<AuditComparisonSegment | null> {
    if (partner.tipo_pessoa !== "PJ") {
      return null;
    }

    const document = onlyDigits(partner.documento);
    if (!document) {
      return null;
    }

    const payload = await this.fetchFromCnpja(document);
    const normalizedPayload = this.normalizeCnpjPayload(payload);
    const { raw, ...normalized } = normalizedPayload ?? {};

    const differences = this.calculateExternalDifferences(partner, normalized);
    const externalData = {
      source: "cnpja",
      document,
      fetchedAt: new Date().toISOString(),
      raw,
      normalized
    };

    return { differences, externalData };
  }

  private async compareWithChangeRequests(partner: Partner): Promise<AuditComparisonSegment | null> {
    const requests = await this.changeRepo.find({
      where: { partnerId: partner.id },
      order: { createdAt: "DESC" },
      take: 5
    });

    for (const request of requests) {
      const payload = request?.payload ?? {};
      const partners = Array.isArray(payload?.partners) ? payload.partners : [];
      const entry =
        partners.find((item: any) => item?.partnerId === partner.id) ??
        (partners.length > 0 ? partners[0] : null);
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      if (!changes.length) {
        continue;
      }

      const differences: PartnerAuditDifference[] = changes.map((change: any) => ({
        field: change?.field ?? "unknown",
        label: change?.label ?? change?.field,
        before: change?.previousValue ?? null,
        after: change?.newValue ?? null,
        source: "change_request",
        metadata: {
          changeRequestId: request.id,
          requestType: request.requestType,
          status: request.status,
          requestedBy: request.requestedBy ?? null,
          createdAt: request.createdAt instanceof Date ? request.createdAt.toISOString() : request.createdAt,
          payloadMetadata: payload?.metadata,
          partnerEntryMetadata: entry?.metadata
        }
      }));

      const externalData = {
        source: "change_request",
        changeRequestId: request.id,
        requestType: request.requestType,
        status: request.status,
        requestedBy: request.requestedBy ?? null,
        createdAt: request.createdAt instanceof Date ? request.createdAt.toISOString() : request.createdAt,
        payload
      };

      return { differences, externalData };
    }

    return null;
  }

  private calculateExternalDifferences(partner: Partner, normalized: Record<string, any>) {
    if (!normalized) {
      return [] as PartnerAuditDifference[];
    }

    const differences: PartnerAuditDifference[] = [];
    for (const mapping of AUDIT_FIELD_MAPPINGS) {
      const rawPartnerValue = this.resolvePath(partner, mapping.partnerPath);
      const rawExternalValue = this.resolvePath(normalized, mapping.externalPath);
      const partnerValue = mapping.partnerTransform ? mapping.partnerTransform(rawPartnerValue) : rawPartnerValue;
      const externalValue = mapping.externalTransform ? mapping.externalTransform(rawExternalValue) : rawExternalValue;

      if (!this.hasSameValue(partnerValue, externalValue)) {
        differences.push({
          field: mapping.field,
          label: mapping.label,
          before: partnerValue ?? null,
          after: externalValue ?? null,
          source: "external",
          metadata: {
            partnerPath: mapping.partnerPath,
            externalPath: mapping.externalPath,
            rawPartnerValue: rawPartnerValue ?? null,
            rawExternalValue: rawExternalValue ?? null
          }
        });
      }
    }

    return differences;
  }

  private hasSameValue(a: any, b: any) {
    const normalizedA = this.normalizeComparisonValue(a);
    const normalizedB = this.normalizeComparisonValue(b);
    return JSON.stringify(normalizedA) === JSON.stringify(normalizedB);
  }

  private normalizeComparisonValue(value: any): any {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === "string") {
      return value.trim();
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeComparisonValue(item));
    }
    if (typeof value === "object") {
      const result: Record<string, any> = {};
      for (const key of Object.keys(value).sort()) {
        result[key] = this.normalizeComparisonValue((value as any)[key]);
      }
      return result;
    }
    return value;
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

          const comparison = await this.buildAuditComparison(partner);
          await this.auditLogRepo.save({
            jobId,
            partnerId,
            result: comparison.result,
            message: comparison.message,
            differences: comparison.differences.length ? comparison.differences : null,
            externalData: comparison.externalData
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
    const baseUrl = process.env.CNPJ_OPEN_API_URL || "https://api.cnpja.com";
    const token = process.env.CNPJ_OPEN_API_TOKEN;
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/office/${cnpj}`, { headers });
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
    return this.resolvePath(partner, path);
  }

  private resolvePath(source: any, path: string) {
    if (!path) {
      return source;
    }
    return path.split(".").reduce<any>((acc, segment) => {
      if (acc === undefined || acc === null) {
        return undefined;
      }
      if (Array.isArray(acc) && /^\d+$/.test(segment)) {
        return acc[Number(segment)];
      }
      return (acc as any)[segment];
    }, source);
  }

  private async registerExternalAudit(partner: Partner, changeRequest: PartnerChangeRequest) {
    const job = this.auditJobRepo.create({
      scope: "individual",
      partnerIds: [partner.id],
      status: "registrado",
      requestedBy: changeRequest.requestedBy ?? "externo"
    });
    await this.auditJobRepo.save(job);

    const payload = changeRequest?.payload ?? {};
    const partnerEntries = Array.isArray((payload as any)?.partners) ? (payload as any).partners : [];
    const differences: PartnerAuditDifference[] = partnerEntries.flatMap((entry: any) => {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      return changes.map((change: any) => ({
        field: change?.field ?? "unknown",
        label: change?.label ?? change?.field ?? "unknown",
        before: change?.previousValue ?? null,
        after: change?.newValue ?? null,
        source: "change_request" as const
      }));
    });

    const externalData = {
      source: "change_request",
      changeRequestId: changeRequest.id,
      requestType: changeRequest.requestType,
      status: changeRequest.status,
      origin: (payload as any)?.origin ?? null,
      motivo: changeRequest.motivo ?? null,
      requestedBy: changeRequest.requestedBy ?? null,
      createdAt:
        changeRequest.createdAt instanceof Date
          ? changeRequest.createdAt.toISOString()
          : changeRequest.createdAt ?? null,
      payload
    };

    await this.auditLogRepo.save({
      jobId: job.id,
      partnerId: partner.id,
      result: "inconsistente",
      differences,
      externalData,
      message: `Solicitacao externa de alteracao ${changeRequest.id}`
    });
  }
}

