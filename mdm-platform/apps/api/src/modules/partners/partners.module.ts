import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Partner } from './entities/partner.entity';
import { PartnerChangeRequest } from './entities/partner-change-request.entity';
import { PartnerAuditJob } from './entities/partner-audit-job.entity';
import { PartnerAuditLog } from './entities/partner-audit-log.entity';
import { PartnersService } from './partners.service';
import { PartnersController } from './partners.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Partner, PartnerChangeRequest, PartnerAuditJob, PartnerAuditLog])],
  providers: [PartnersService],
  controllers: [PartnersController]
})
export class PartnersModule {}