import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WeeklyQueryDto, MonthlyQueryDto, RangeQueryDto } from './dto/report-query.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getWeeklySummary(query: WeeklyQueryDto) {
    const { year, week, area, employeeId } = query;
    const { startDate, endDate } = this.weekRange(year, week);
    return this.aggregate({ startDate, endDate, area, employeeId, label: `Semana ${week} de ${year}` });
  }

  async getMonthlySummary(query: MonthlyQueryDto) {
    const { year, month, area, employeeId } = query;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);
    return this.aggregate({
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      area, employeeId,
      label: `${['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][month-1]} ${year}`,
    });
  }

  async getRangeSummary(query: RangeQueryDto) {
    const { startDate, endDate, area, employeeId } = query;
    if (new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'La fecha fin debe ser posterior a la fecha inicio',
        code: 'RANGO_INVALIDO',
      });
    }
    return this.aggregate({
      startDate,
      endDate,
      area, employeeId,
      label: `${startDate} a ${endDate}`,
    });
  }

  private async aggregate(params: {
    startDate: string;
    endDate: string;
    area?: string;
    employeeId?: number;
    label: string;
  }) {
    const { startDate, endDate, area, employeeId, label } = params;

    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate);

    const employeeWhere: any = {};
    if (area) employeeWhere.area = area;
    if (employeeId) employeeWhere.id = employeeId;

    const rangeEndExclusive = new Date(rangeEnd.getTime() + 1);

    const sessionWhere: any = {
      startTime: { gte: rangeStart, lt: rangeEndExclusive },
      isVoided: false,
    };
    if (employeeId) sessionWhere.employeeId = employeeId;

    const employees = await this.prisma.employee.findMany({
      where: { ...employeeWhere, isActive: true },
      select: { id: true, firstName: true, lastName: true, documentNumber: true, area: true },
      orderBy: { lastName: 'asc' },
    });

    if (employees.length === 0) {
      return {
        data: [],
        periodo: label,
        desde: startDate,
        hasta: endDate,
        totalHoras: 0,
        totalJornadas: 0,
      };
    }

    const groups = await this.prisma.workSession.groupBy({
      by: ['employeeId'],
      where: {
        ...sessionWhere,
        employeeId: { in: employees.map((e) => e.id) },
      },
      _sum: {
        totalMinutes: true,
        ordinaryMinutes: true,
        nightSurchargeMinutes: true,
        extraDayMinutes: true,
        extraNightMinutes: true,
        sundayMinutes: true,
        holidayMinutes: true,
        extraHolidayDayMinutes: true,
        extraHolidayNightMinutes: true,
        sundayNightSurchargeMinutes: true,
      },
      _count: { id: true },
    });

    const empMap = new Map(employees.map((e) => [e.id, e]));

    const data = groups
      .map((g) => {
        const emp = empMap.get(g.employeeId);
        if (!emp) return null;
        return {
          employee: emp,
          totalSessions: g._count.id,
          totalMinutes: g._sum.totalMinutes ?? 0,
          ordinaryMinutes: g._sum.ordinaryMinutes ?? 0,
          nightSurchargeMinutes: g._sum.nightSurchargeMinutes ?? 0,
          extraDayMinutes: g._sum.extraDayMinutes ?? 0,
          extraNightMinutes: g._sum.extraNightMinutes ?? 0,
          sundayMinutes: g._sum.sundayMinutes ?? 0,
          holidayMinutes: g._sum.holidayMinutes ?? 0,
          extraHolidayDayMinutes: g._sum.extraHolidayDayMinutes ?? 0,
          extraHolidayNightMinutes: g._sum.extraHolidayNightMinutes ?? 0,
          sundayNightSurchargeMinutes: g._sum.sundayNightSurchargeMinutes ?? 0,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    const totalHoras = data.reduce((s, d) => s + d.totalMinutes, 0) / 60;
    const totalJornadas = data.reduce((s, d) => s + d.totalSessions, 0);

    return {
      data,
      periodo: label,
      desde: startDate,
      hasta: endDate,
      totalHoras: Math.round(totalHoras * 100) / 100,
      totalJornadas,
    };
  }

  private weekRange(year: number, week: number): { startDate: string; endDate: string } {
    const jan4 = new Date(year, 0, 4);
    const dayOfWeek = jan4.getDay();
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - ((dayOfWeek + 6) % 7) + (week - 1) * 7);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    return {
      startDate: monday.toISOString().split('T')[0],
      endDate: sunday.toISOString().split('T')[0],
    };
  }
}
