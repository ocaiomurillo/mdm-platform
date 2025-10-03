import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreatePartnerNoteDto {
  @ApiProperty({ description: "Conteúdo da nota" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}
