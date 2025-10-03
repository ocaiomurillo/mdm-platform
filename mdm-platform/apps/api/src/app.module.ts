import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { TypeOrmModule, TypeOrmModuleOptions } from "@nestjs/typeorm";

import { PartnersModule } from "./modules/partners/partners.module";
import { AuthModule } from "./modules/auth/auth.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { UserMaintenanceModule } from "./modules/user-maintenance/user-maintenance.module";
import { HistoryModule } from "./modules/history/history.module";

const dbUrl = process.env.DATABASE_URL || "postgres://mdm:mdm@localhost:5432/mdm";

const typeOrmConfig: TypeOrmModuleOptions = {
  type: "postgres",
  url: dbUrl,
  autoLoadEntities: true,
  synchronize: false
};

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(typeOrmConfig),
    PartnersModule,
    AuthModule,
    NotificationsModule,
    UserMaintenanceModule,
    HistoryModule
  ]
})
export class AppModule {}