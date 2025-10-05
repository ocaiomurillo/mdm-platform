import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class HistoryListQueryDto {
  @ApiPropertyOptional({ description: "Identificador do ator responsável pelo evento" })
  @IsOptional()
  @IsString()
  actorId?: string;

  @ApiPropertyOptional({ description: "Endereço de e-mail do ator responsável pelo evento" })
  @IsOptional()
  @IsString()
  actorEmail?: string;
}
