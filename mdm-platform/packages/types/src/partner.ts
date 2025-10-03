import { z } from "zod";

export const PartnerApprovalStageSchema = z.enum(["fiscal", "compras", "dados_mestres", "finalizado"]);

export const PartnerApprovalActionSchema = z.enum(["submitted", "approved", "rejected"]);

export const SapIntegrationSegmentSchema = z.enum([
  "businessPartner",
  "addresses",
  "roles",
  "banks"
]);

export const SapIntegrationStatusSchema = z.enum(["pending", "processing", "success", "error"]);

export const SapIntegrationSegmentStateSchema = z.object({
  segment: SapIntegrationSegmentSchema,
  status: SapIntegrationStatusSchema,
  lastAttemptAt: z.string().optional(),
  lastSuccessAt: z.string().optional(),
  message: z.string().optional(),
  errorMessage: z.string().optional(),
  sapId: z.string().optional()
});

export const PartnerApprovalHistoryEntrySchema = z.object({
  stage: PartnerApprovalStageSchema,
  action: PartnerApprovalActionSchema,
  performedBy: z.string().uuid().optional(),
  performedByName: z.string().optional(),
  notes: z.string().optional(),
  performedAt: z.string()
});

export const AddressSchema = z.object({
  tipo: z.enum(["fiscal", "cobranca", "entrega"]).
    default("fiscal"),
  cep: z.string(),
  logradouro: z.string(),
  numero: z.string(),
  complemento: z.string().optional(),
  bairro: z.string(),
  municipio_ibge: z.string(),
  uf: z.string().length(2),
  pais: z.string().default("BR"),
  municipio: z.string().optional()
});

export const BankSchema = z.object({
  banco: z.string(),
  agencia: z.string(),
  conta: z.string(),
  pix: z.string().optional()
});

export const CommunicationEmailSchema = z.object({
  endereco: z.string().email(),
  padrao: z.boolean().optional()
});

export const PartnerSchema = z.object({
  id: z.string().uuid().optional(),
  mdm_partner_id: z.number().optional(),
  sap_bp_id: z.string().optional(),
  tipo_pessoa: z.enum(["PJ", "PF"]),
  natureza: z.enum(["cliente", "fornecedor", "ambos"]),
  status: z.enum(["draft", "em_validacao", "aprovado", "rejeitado", "integrado"]).default("draft"),
  nome_legal: z.string(),
  nome_fantasia: z.string().optional(),
  documento: z.string(),
  ie: z.string().optional(),
  im: z.string().optional(),
  suframa: z.string().optional(),
  regime_tributario: z.string().optional(),
  contato_principal: z.object({
    nome: z.string(),
    email: z.string().email(),
    fone: z.string().optional()
  }),
  comunicacao: z.object({
    telefone: z.string().optional(),
    celular: z.string().optional(),
    emails: z.array(CommunicationEmailSchema).default([])
  }).default({ emails: [] }),
  addresses: z.array(AddressSchema).default([]),
  banks: z.array(BankSchema).default([]),
  fornecedor_info: z.object({
    grupo: z.string().optional(),
    condicao_pagamento: z.string().optional()
  }).default({}),
  vendas_info: z.object({
    vendedor: z.string().optional(),
    grupo_clientes: z.string().optional()
  }).default({}),
  fiscal_info: z.object({
    natureza_operacao: z.string().optional(),
    tipo_beneficio_suframa: z.string().optional(),
    regime_declaracao: z.string().optional()
  }).default({}),
  transportadores: z.array(z.object({ sap_bp: z.string().optional() })).default([]),
  credito_info: z.object({
    parceiro: z.string().optional(),
    modalidade: z.string().optional(),
    montante: z.number().optional(),
    validade: z.string().optional()
  }).default({}),
  sap_segments: z.array(SapIntegrationSegmentStateSchema).default([]),
  approvalStage: PartnerApprovalStageSchema.default("fiscal"),
  approvalHistory: z.array(PartnerApprovalHistoryEntrySchema).default([])
});

export type Partner = z.infer<typeof PartnerSchema>;
export type PartnerApprovalStage = z.infer<typeof PartnerApprovalStageSchema>;
export type PartnerApprovalHistoryEntry = z.infer<typeof PartnerApprovalHistoryEntrySchema>;
export type PartnerApprovalAction = z.infer<typeof PartnerApprovalActionSchema>;
export type SapIntegrationSegment = z.infer<typeof SapIntegrationSegmentSchema>;
export type SapIntegrationStatus = z.infer<typeof SapIntegrationStatusSchema>;
export type SapIntegrationSegmentState = z.infer<typeof SapIntegrationSegmentStateSchema>;

export type PartnerRegistrationStepId =
  | "basicData"
  | "documents"
  | "contacts"
  | "addresses"
  | "banks"
  | "integrations"
  | "approvals";

export type PartnerRegistrationStepStatus = "pending" | "in_progress" | "complete" | "blocked";

export type PartnerRegistrationStep = {
  id: PartnerRegistrationStepId;
  label: string;
  status: PartnerRegistrationStepStatus;
  completedItems: number;
  totalItems: number;
  missing?: string[];
};

export type PartnerRegistrationOverallStatus = "pending" | "in_progress" | "complete" | "blocked";

export type PartnerRegistrationProgress = {
  steps: PartnerRegistrationStep[];
  completedSteps: number;
  totalSteps: number;
  completionPercentage: number;
  overallStatus: PartnerRegistrationOverallStatus;
};
