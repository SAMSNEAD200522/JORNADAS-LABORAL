import { Module } from '@nestjs/common';
import { AuditEngineService } from './audit-engine.service';

@Module({
  providers: [AuditEngineService],
  exports: [AuditEngineService],
})
export class AuditEngineModule {}
