import { Module } from '@nestjs/common';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { EmployeesModule } from '../employees/employees.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [EmployeesModule, AuditModule],
  controllers: [ImportController],
  providers: [ImportService],
  exports: [ImportService],
})
export class ImportModule {}
