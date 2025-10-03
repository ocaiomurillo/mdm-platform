import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import { CreatePartnerDto } from "./dto/create-partner.dto";
import { ChangeRequestListQueryDto, CreateBulkChangeRequestDto, CreateChangeRequestDto } from "./dto/change-request.dto";
import { AuthenticatedUser, PartnersService } from "./partners.service";
import { SAP_INTEGRATION_SEGMENTS } from "./sap-integration.service";
import { CreatePartnerNoteDto } from "./dto/partner-note.dto";

class AuditRequestDto {
  partnerIds!: string[];
  requestedBy?: string;
}

class AuditSingleDto {
  requestedBy?: string;
}

class StageDecisionDto {
  motivo?: string;
}

type AuthenticatedRequest = Request & { user: AuthenticatedUser };

@ApiTags("partners")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"))
@Controller("partners")
export class PartnersController {
  constructor(private readonly svc: PartnersService) {}

  @Post()
  create(@Body() dto: CreatePartnerDto) {
    return this.svc.create(dto);
  }

  @Get()
  findAll(@Query("search") search?: string, @Query("status") status?: string) {
    return this.svc.findAll({ search, status });
  }

  @Get("search")
  search(@Query("q") q?: string, @Query() query?: Record<string, string>) {
    const filters = { ...query };
    delete filters.q;
    return this.svc.search({ q, filters });
  }

  @Get(":id/details")
  getDetails(@Param("id") id: string) {
    return this.svc.getDetails(id);
  }

  @Get(":id/notes")
  listNotes(@Param("id") id: string) {
    return this.svc.listNotes(id);
  }

  @Post(":id/notes")
  createNote(@Param("id") id: string, @Body() dto: CreatePartnerNoteDto, @Req() req: AuthenticatedRequest) {
    return this.svc.createNote(id, dto, req.user);
  }

  @Post(":id/change-requests")
  createChangeRequest(@Param("id") id: string, @Body() dto: CreateChangeRequestDto) {
    return this.svc.createChangeRequest(id, dto);
  }

  @Post("change-requests/bulk")
  createBulkChangeRequests(@Body() dto: CreateBulkChangeRequestDto) {
    return this.svc.createBulkChangeRequests(dto);
  }

  @Get(":id/change-requests")
  listChangeRequests(@Param("id") id: string, @Query() query: ChangeRequestListQueryDto) {
    return this.svc.listChangeRequests(id, query);
  }

  @Post(":id/audit")
  requestAuditForPartner(@Param("id") id: string, @Body() body: AuditSingleDto) {
    return this.svc.requestAudit([id], body?.requestedBy);
  }

  @Post("audit")
  requestAudit(@Body() body: AuditRequestDto) {
    const { partnerIds = [], requestedBy } = body || {};
    return this.svc.requestAudit(partnerIds, requestedBy);
  }

  @Get("audit/:jobId")
  getAuditJob(@Param("jobId") jobId: string) {
    return this.svc.getAuditJob(jobId);
  }

  @Get("cnpj/:cnpj")
  lookupCnpj(@Param("cnpj") cnpj: string) {
    return this.svc.lookupCnpj(cnpj);
  }

  @Get("cpf/:cpf")
  lookupCpf(@Param("cpf") cpf: string) {
    return this.svc.lookupCpf(cpf);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.svc.findOne(id);
  }

  @Post(":id/submit")
  @ApiOperation({ summary: "Submete o parceiro para validação e inicia o envio dos dados principais ao SAP." })
  submit(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.submit(id, req.user);
  }

  @Post(":id/fiscal/approve")
  approveFiscal(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.approveStage(id, "fiscal", req.user);
  }

  @Post(":id/fiscal/reject")
  rejectFiscal(@Param("id") id: string, @Req() req: AuthenticatedRequest, @Body() body: StageDecisionDto) {
    return this.svc.rejectStage(id, "fiscal", req.user, body?.motivo);
  }

  @Post(":id/compras/approve")
  approveCompras(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.approveStage(id, "compras", req.user);
  }

  @Post(":id/compras/reject")
  rejectCompras(@Param("id") id: string, @Req() req: AuthenticatedRequest, @Body() body: StageDecisionDto) {
    return this.svc.rejectStage(id, "compras", req.user, body?.motivo);
  }

  @Post(":id/dados-mestres/approve")
  approveDadosMestres(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    return this.svc.approveStage(id, "dados_mestres", req.user);
  }

  @Post(":id/dados-mestres/reject")
  rejectDadosMestres(@Param("id") id: string, @Req() req: AuthenticatedRequest, @Body() body: StageDecisionDto) {
    return this.svc.rejectStage(id, "dados_mestres", req.user, body?.motivo);
  }

  @Post(":id/integrations/sap/retry")
  @ApiOperation({
    summary: "Reprocessa todos os segmentos SAP pendentes ou com falha.",
    description: "Requer as variáveis SAP_BASE_URL, SAP_USER e SAP_PASSWORD configuradas."
  })
  @ApiResponse({ status: 200, description: "Estado atualizado da integração." })
  retrySapIntegration(@Param("id") id: string) {
    return this.svc.retrySapIntegration(id);
  }

  @Post(":id/integrations/sap/:segment")
  @ApiOperation({
    summary: "Dispara o envio de um segmento específico para o SAP.",
    description: "Requer SAP_BASE_URL, SAP_USER e SAP_PASSWORD definidos e o parceiro na etapa finalizada."
  })
  @ApiParam({
    name: "segment",
    enum: SAP_INTEGRATION_SEGMENTS,
    description: "Segmento da integração SAP (businessPartner, addresses, roles, banks)."
  })
  @ApiResponse({ status: 200, description: "Estado atualizado da integração." })
  triggerSapSegment(@Param("id") id: string, @Param("segment") segment: string) {
    return this.svc.triggerSapIntegrationSegment(id, segment);
  }
}

