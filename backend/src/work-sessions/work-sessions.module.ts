import { Module } from '@nestjs/common';
import { WorkSessionsController } from './work-sessions.controller';
import { WorkSessionsService } from './work-sessions.service';
import { LaborEngineModule } from '../labor-engine/labor-engine.module';
import { AuditEngineModule } from '../audit-engine/audit-engine.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [LaborEngineModule, AuditEngineModule, PrismaModule],
  controllers: [WorkSessionsController],
  providers: [WorkSessionsService],
  exports: [WorkSessionsService],
})
export class WorkSessionsModule {}
