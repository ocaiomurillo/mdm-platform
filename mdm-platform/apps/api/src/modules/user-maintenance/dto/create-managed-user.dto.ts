import { IsArray, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from "class-validator";

import { MANAGED_USER_STATUSES, ManagedUserStatus } from "../user-maintenance.types";

export class CreateManagedUserDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  profile: string | null = null;

  @IsArray()
  @IsString({ each: true })
  responsibilities!: string[];

  @IsIn(MANAGED_USER_STATUSES)
  status!: ManagedUserStatus;

  @IsOptional()
  @IsString()
  lastAccessAt?: string | null;
}
