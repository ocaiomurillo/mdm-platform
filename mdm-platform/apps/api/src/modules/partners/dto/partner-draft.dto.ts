import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional } from "class-validator";

export class CreatePartnerDraftDto {
  @ApiPropertyOptional({ type: Object, description: "Dados parciais do formulário do parceiro" })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}

export class UpdatePartnerDraftDto {
  @ApiPropertyOptional({ type: Object, description: "Campos a serem atualizados no rascunho" })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}
