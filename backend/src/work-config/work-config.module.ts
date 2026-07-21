import { Module } from '@nestjs/common';
import { WorkConfigService } from './work-config.service';
import { WorkConfigController } from './work-config.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [WorkConfigController],
  providers: [WorkConfigService],
  exports: [WorkConfigService],
})
export class WorkConfigModule {}
