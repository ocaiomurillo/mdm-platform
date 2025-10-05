import { PartialType } from "@nestjs/swagger";

import { CreateManagedUserDto } from "./create-managed-user.dto";

export class UpdateManagedUserDto extends PartialType(CreateManagedUserDto) {}
