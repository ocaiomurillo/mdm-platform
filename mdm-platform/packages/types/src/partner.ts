import { z } from "zod";

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
  sap_segments: z.array(z.any()).default([])
});

export type Partner = z.infer<typeof PartnerSchema>;