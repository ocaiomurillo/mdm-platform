import { ApiProperty } from "@nestjs/swagger";

export class CreatePartnerDto {
  @ApiProperty({ enum: ["PJ", "PF"] }) tipo_pessoa: "PJ" | "PF";
  @ApiProperty({ enum: ["cliente", "fornecedor", "ambos"] }) natureza: "cliente" | "fornecedor" | "ambos";
  @ApiProperty() nome_legal: string;
  @ApiProperty({ required: false }) nome_fantasia?: string;
  @ApiProperty() documento: string;
  @ApiProperty({ required: false }) ie?: string;
  @ApiProperty({ required: false }) im?: string;
  @ApiProperty({ required: false }) suframa?: string;
  @ApiProperty({ required: false }) regime_tributario?: string;
  @ApiProperty({ type: Object }) contato_principal: { nome: string; email: string; fone?: string };
  @ApiProperty({ type: Object, required: false }) comunicacao?: {
    telefone?: string;
    celular?: string;
    emails?: { endereco: string; padrao?: boolean }[];
  };
  @ApiProperty({ type: Array, required: false }) addresses?: any[];
  @ApiProperty({ type: Array, required: false }) banks?: any[];
  @ApiProperty({ type: Object, required: false }) fornecedor_info?: {
    grupo?: string;
    condicao_pagamento?: string;
  };
  @ApiProperty({ type: Object, required: false }) vendas_info?: {
    vendedor?: string;
    grupo_clientes?: string;
  };
  @ApiProperty({ type: Object, required: false }) fiscal_info?: {
    natureza_operacao?: string;
    tipo_beneficio_suframa?: string;
    regime_declaracao?: string;
  };
  @ApiProperty({ type: Array, required: false }) transportadores?: { sap_bp?: string }[];
  @ApiProperty({ type: Object, required: false }) credito_info?: {
    parceiro?: string;
    modalidade?: string;
    montante?: number;
    validade?: string;
  };
  @ApiProperty({ type: Array, required: false }) sap_segments?: any[];
  @ApiProperty({ required: false }) sap_bp_id?: string;
}