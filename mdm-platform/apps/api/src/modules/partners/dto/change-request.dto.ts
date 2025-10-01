import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested
} from "class-validator";
import { ChangeRequestOrigin, ChangeRequestStatus, ChangeRequestType } from "@mdm/types";

export const CHANGE_REQUEST_ORIGINS: ChangeRequestOrigin[] = ["interno", "externo"];
export const CHANGE_REQUEST_STATUSES: ChangeRequestStatus[] = ["pendente", "aprovada", "rejeitada"];
export const CHANGE_REQUEST_TYPES: ChangeRequestType[] = ["individual", "massa", "auditoria"];

export class ChangeRequestFieldDto {
  @ApiProperty()
  @IsString()
  field!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  newValue?: any;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class CreateChangeRequestDto {
  @ApiProperty({ type: [ChangeRequestFieldDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChangeRequestFieldDto)
  fields!: ChangeRequestFieldDto[];

  @ApiProperty()
  @IsString()
  motivo!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  requestedBy?: string;

  @ApiProperty({ required: false, enum: CHANGE_REQUEST_ORIGINS })
  @IsOptional()
  @IsIn(CHANGE_REQUEST_ORIGINS)
  origin?: ChangeRequestOrigin;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  metadata?: Record<string, any>;
}

export class CreateBulkChangeRequestDto extends CreateChangeRequestDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  partnerIds!: string[];
}

export class ChangeRequestListQueryDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiProperty({ required: false, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize = 20;

  @ApiProperty({ required: false, enum: CHANGE_REQUEST_STATUSES })
  @IsOptional()
  @IsIn(CHANGE_REQUEST_STATUSES)
  status?: ChangeRequestStatus;

  @ApiProperty({ required: false, enum: CHANGE_REQUEST_TYPES })
  @IsOptional()
  @IsIn(CHANGE_REQUEST_TYPES)
  requestType?: ChangeRequestType;
}
