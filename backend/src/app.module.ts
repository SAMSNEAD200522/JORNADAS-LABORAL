import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { EmployeesModule } from './employees/employees.module';
import { SchedulesModule } from './schedules/schedules.module';
import { WorkSessionsModule } from './work-sessions/work-sessions.module';
import { HolidaysModule } from './holidays/holidays.module';
import { ReportsModule } from './reports/reports.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { WorkConfigModule } from './work-config/work-config.module';
import { UsersModule } from './users/users.module';
import { ImportModule } from './import/import.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    EmployeesModule,
    SchedulesModule,
    WorkSessionsModule,
    HolidaysModule,
    ReportsModule,
    AuthModule,
    AuditModule,
    WorkConfigModule,
    UsersModule,
    ImportModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
