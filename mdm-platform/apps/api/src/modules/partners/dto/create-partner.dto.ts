import { ApiProperty } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsArray,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Validate,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface
} from "class-validator";
import { SapIntegrationSegmentState } from "@mdm/types";
import { onlyDigits, validateCNPJ, validateCPF } from "@mdm/utils";
import { IsCep, IsIbgeCode, IsStateRegistration } from "../../../common/validators";

@ValidatorConstraint({ name: "partnerDocument", async: false })
class PartnerDocumentConstraint implements ValidatorConstraintInterface {
  validate(value: string, args: ValidationArguments) {
    if (typeof value !== "string") return false;
    const tipoPessoa = (args.object as any)?.tipo_pessoa;
    if (tipoPessoa === "PF") {
      return validateCPF(value);
    }
    if (tipoPessoa === "PJ") {
      return validateCNPJ(value);
    }
    return false;
  }

  defaultMessage(args: ValidationArguments) {
    const tipoPessoa = (args.object as any)?.tipo_pessoa;
    return tipoPessoa === "PJ" ? "CNPJ inválido" : "CPF inválido";
  }
}

class PartnerEmailDto {
  @ApiProperty()
  @IsEmail({}, { message: "Email inválido" })
  endereco!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  padrao?: boolean;
}

class PartnerCommunicationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telefone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  celular?: string;

  @ApiProperty({ type: [PartnerEmailDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerEmailDto)
  emails?: PartnerEmailDto[];
}

class PartnerContactDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  nome!: string;

  @ApiProperty()
  @IsEmail({}, { message: "Email inválido" })
  email!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  fone?: string;
}

class PartnerAddressDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  tipo?: string;

  @ApiProperty()
  @Transform(({ value }) => onlyDigits(value ?? ""))
  @IsCep({ message: "CEP inválido" })
  cep!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  logradouro!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  numero!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  complemento?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bairro!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  municipio!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsIbgeCode({ message: "Código IBGE inválido" })
  municipio_ibge?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  uf!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  pais?: string;
}

export class CreatePartnerDto {
  @ApiProperty({ enum: ["PJ", "PF"] })
  @IsIn(["PJ", "PF"])
  tipo_pessoa!: "PJ" | "PF";

  @ApiProperty({ enum: ["cliente", "fornecedor", "ambos"] })
  @IsIn(["cliente", "fornecedor", "ambos"])
  natureza!: "cliente" | "fornecedor" | "ambos";

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  nome_legal!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  nome_fantasia?: string;

  @ApiProperty()
  @Transform(({ value }) => onlyDigits(value ?? ""))
  @IsString()
  @IsNotEmpty()
  @Validate(PartnerDocumentConstraint)
  documento!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsStateRegistration({ allowIsento: true, message: "Inscrição estadual inválida" })
  ie?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  im?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  suframa?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  regime_tributario?: string;

  @ApiProperty({ type: Object })
  @ValidateNested()
  @Type(() => PartnerContactDto)
  contato_principal!: PartnerContactDto;

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => PartnerCommunicationDto)
  comunicacao?: PartnerCommunicationDto;

  @ApiProperty({ type: Array, required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartnerAddressDto)
  addresses?: PartnerAddressDto[];

  @ApiProperty({ type: Array, required: false })
  @IsOptional()
  @IsArray()
  banks?: any[];

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  fornecedor_info?: {
    grupo?: string;
    condicao_pagamento?: string;
  };

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  vendas_info?: {
    vendedor?: string;
    grupo_clientes?: string;
  };

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  fiscal_info?: {
    natureza_operacao?: string;
    tipo_beneficio_suframa?: string;
    regime_declaracao?: string;
  };

  @ApiProperty({ type: Array, required: false })
  @IsOptional()
  transportadores?: { sap_bp?: string }[];

  @ApiProperty({ type: Object, required: false })
  @IsOptional()
  credito_info?: {
    parceiro?: string;
    modalidade?: string;
    montante?: number;
    validade?: string;
  };

  @ApiProperty({ type: Array, required: false })
  @IsOptional()
  sap_segments?: SapIntegrationSegmentState[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  sap_bp_id?: string;
}
