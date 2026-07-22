import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { ReportsService } from './reports.service';
import {
  WeeklyQueryDto,
  MonthlyQueryDto,
  RangeQueryDto,
} from './dto/report-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('Reportes')
@Controller('reportes')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @Get('semanal')
  @ApiOperation({
    summary: 'Resumen semanal por empleado (agrupado por semana ISO)',
  })
  getWeekly(@Query() query: WeeklyQueryDto) {
    return this.reportsService.getWeeklySummary(query);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @Get('mensual')
  @ApiOperation({ summary: 'Resumen mensual por empleado' })
  getMonthly(@Query() query: MonthlyQueryDto) {
    return this.reportsService.getMonthlySummary(query);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @Get('rango')
  @ApiOperation({ summary: 'Resumen por rango personalizado de fechas' })
  getRange(@Query() query: RangeQueryDto) {
    return this.reportsService.getRangeSummary(query);
  }
}
