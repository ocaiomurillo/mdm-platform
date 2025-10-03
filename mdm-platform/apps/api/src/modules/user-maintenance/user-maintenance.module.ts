import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { UserMaintenanceController } from "./user-maintenance.controller";
import { UserMaintenanceService } from "./user-maintenance.service";

@Module({
  imports: [AuthModule],
  controllers: [UserMaintenanceController],
  providers: [UserMaintenanceService]
})
export class UserMaintenanceModule {}
