import { z } from "zod";

export const changeRequestFieldDefinitions = [
  { id: "nome_legal", label: "Nome legal", path: "nome_legal" },
  { id: "nome_fantasia", label: "Nome fantasia", path: "nome_fantasia" },
  { id: "contato_principal.nome", label: "Contato - nome", path: "contato_principal.nome" },
  { id: "contato_principal.email", label: "Contato - email", path: "contato_principal.email" },
  { id: "contato_principal.fone", label: "Contato - telefone", path: "contato_principal.fone" },
  { id: "comunicacao.telefone", label: "Telefone geral", path: "comunicacao.telefone" },
  { id: "comunicacao.celular", label: "Celular geral", path: "comunicacao.celular" },
  { id: "fornecedor_info.grupo", label: "Fornecedor - grupo", path: "fornecedor_info.grupo" },
  { id: "fornecedor_info.condicao_pagamento", label: "Fornecedor - condição de pagamento", path: "fornecedor_info.condicao_pagamento" },
  { id: "vendas_info.vendedor", label: "Vendas - vendedor", path: "vendas_info.vendedor" },
  { id: "vendas_info.grupo_clientes", label: "Vendas - grupo de clientes", path: "vendas_info.grupo_clientes" },
  { id: "fiscal_info.natureza_operacao", label: "Fiscal - natureza da operação", path: "fiscal_info.natureza_operacao" },
  { id: "fiscal_info.tipo_beneficio_suframa", label: "Fiscal - benefício SUFRAMA", path: "fiscal_info.tipo_beneficio_suframa" },
  { id: "fiscal_info.regime_declaracao", label: "Fiscal - regime de declaração", path: "fiscal_info.regime_declaracao" },
  { id: "credito_info.parceiro", label: "Crédito - parceiro", path: "credito_info.parceiro" },
  { id: "credito_info.modalidade", label: "Crédito - modalidade", path: "credito_info.modalidade" },
  { id: "credito_info.montante", label: "Crédito - montante", path: "credito_info.montante" },
  { id: "credito_info.validade", label: "Crédito - validade", path: "credito_info.validade" }
] as const;

export type ChangeRequestFieldId = typeof changeRequestFieldDefinitions[number]["id"];

export type ChangeRequestStatus = "pendente" | "aprovada" | "rejeitada";

export type ChangeRequestType = "individual" | "massa" | "auditoria";

export type ChangeRequestOrigin = "interno" | "externo";

export const ChangeRequestFieldChangeSchema = z.object({
  field: z.string(),
  label: z.string().optional(),
  previousValue: z.any().optional(),
  newValue: z.any().optional()
});

export const ChangeRequestPartnerEntrySchema = z.object({
  partnerId: z.string().uuid(),
  partnerName: z.string(),
  document: z.string().optional(),
  changes: z.array(ChangeRequestFieldChangeSchema).default([])
});

export const ChangeRequestPayloadSchema = z.object({
  tipo: z.custom<ChangeRequestType>(),
  motivo: z.string().optional(),
  origin: z.custom<ChangeRequestOrigin>().optional(),
  batchId: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional(),
  partners: z.array(ChangeRequestPartnerEntrySchema)
});

export type ChangeRequestFieldChange = z.infer<typeof ChangeRequestFieldChangeSchema>;
export type ChangeRequestPartnerEntry = z.infer<typeof ChangeRequestPartnerEntrySchema>;
export type ChangeRequestPayload = z.infer<typeof ChangeRequestPayloadSchema>;
