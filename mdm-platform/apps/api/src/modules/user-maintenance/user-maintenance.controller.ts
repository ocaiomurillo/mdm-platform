import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "@nestjs/passport";

import { UserMaintenanceService } from "./user-maintenance.service";

@ApiTags("user-maintenance")
@ApiBearerAuth()
@UseGuards(AuthGuard("jwt"))
@Controller("user-maintenance")
export class UserMaintenanceController {
  constructor(private readonly service: UserMaintenanceService) {}

  @Get()
  list() {
    return this.service.list();
  }
}
