import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LaborEngineService } from '../labor-engine/labor-engine.service';
import { EngineOutput } from '../labor-engine/labor-engine.types';
import { CreateWorkSessionDto } from './dto/create-work-session.dto';
import { UpdateWorkSessionDto } from './dto/update-work-session.dto';
import { QueryWorkSessionDto } from './dto/query-work-session.dto';
import { VoidWorkSessionDto } from './dto/void-work-session.dto';
import { CompensatoryDecisionDto } from './dto/compensatory-decision.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class WorkSessionsService {
  constructor(
    private prisma: PrismaService,
    private engine: LaborEngineService,
    private audit: AuditService,
  ) {}

  private mapToPrismaData(c: EngineOutput) {
    return {
      totalMinutes: c.totalMinutes,
      ordinaryMinutes: c.ordinarioDiurno + c.ordinarioNocturno,
      nightSurchargeMinutes: c.ordinarioNocturno,
      extraDayMinutes: c.extraDiurno,
      extraNightMinutes: c.extraNocturno,
      sundayMinutes: c.dominicalDiurno + c.dominicalNocturno,
      holidayMinutes: c.festivoDiurno + c.festivoNocturno,
      extraHolidayDayMinutes: c.extraDominicalFestivoDiurno,
      extraHolidayNightMinutes: c.extraDominicalFestivoNocturno,
      sundayNightSurchargeMinutes: c.dominicalNocturno + c.festivoNocturno,
    };
  }

  async create(dto: CreateWorkSessionDto, userId?: number) {
    const { employeeId, startTime, endTime, restDayWorked } = dto;

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        workConfig: { include: { ordinaryDistributions: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Empleado con ID ${employeeId} no encontrado`,
        code: 'EMPLEADO_NO_ENCONTRADO',
      });
    }

    if (!employee.isActive) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'No se pueden registrar jornadas para un empleado inactivo',
        code: 'EMPLEADO_INACTIVO',
      });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Las fechas proporcionadas no son válidas',
        code: 'FECHAS_INVALIDAS',
      });
    }

    if (end <= start) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'La hora de salida debe ser posterior a la hora de entrada',
        code: 'JORNADA_FECHAS_INVALIDAS',
      });
    }

    const holidays = await this.prisma.holiday.findMany({
      select: { date: true },
    });

    const config = employee.workConfig;
    const ordinaryDistributions =
      config?.ordinaryDistributions?.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        ordinaryMinutesCap: d.ordinaryMinutesCap,
      })) ?? [];

    const accumulatedWeekMinutes = await this.getAccumulatedWeekMinutes(
      employeeId,
      start,
    );

    const classification = this.engine.classify({
      startTime: start,
      endTime: end,
      ordinaryDistributions,
      holidays: holidays.map((h) => h.date),
      workModality: employee.workModality,
      weeklyTargetMinutes:
        employee.weeklyTargetMinutes ?? config?.weeklyTargetMinutes ?? 2520,
      accumulatedWeekMinutes,
      breakMinutes: config?.breakMinutes ?? 60,
      breakThresholdMinutes: config?.breakThresholdMinutes ?? null,
    });

    const prismaData = this.mapToPrismaData(classification);

    const session = await this.prisma.workSession.create({
      data: {
        employeeId,
        startTime: start,
        endTime: end,
        restDayWorked: restDayWorked ?? false,
        ...prismaData,
      },
      include: { employee: true },
    });

    this.audit.log({
      userId,
      action: 'CREAR',
      entity: 'Jornada',
      entityId: session.id,
      newValues: { employeeId, startTime, endTime, ...classification },
    });

    return session;
  }

  async findAll(query: QueryWorkSessionDto) {
    const {
      employeeId,
      startDate,
      endDate,
      onlyActive,
      page = 1,
      limit = 20,
    } = query;

    const where: Prisma.WorkSessionWhereInput = {};

    if (employeeId) where.employeeId = employeeId;
    if (startDate)
      where.startTime = {
        ...(where.startTime as any),
        gte: new Date(startDate),
      };
    if (endDate)
      where.endTime = { ...(where.endTime as any), lte: new Date(endDate) };
    if (onlyActive !== 'false') where.isVoided = false;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.workSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startTime: 'desc' },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              documentNumber: true,
            },
          },
        },
      }),
      this.prisma.workSession.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const session = await this.prisma.workSession.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!session) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Jornada con ID ${id} no encontrada`,
        code: 'JORNADA_NO_ENCONTRADA',
      });
    }

    return session;
  }

  async update(id: number, dto: UpdateWorkSessionDto, userId?: number) {
    const session = await this.findOne(id);

    if (session.isVoided) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'No se puede modificar una jornada anulada',
        code: 'JORNADA_ANULADA',
      });
    }

    const employeeId = dto.employeeId ?? session.employeeId;
    const startTime = dto.startTime
      ? new Date(dto.startTime)
      : session.startTime;
    const endTime = dto.endTime ? new Date(dto.endTime) : session.endTime;

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Las fechas proporcionadas no son válidas',
        code: 'FECHAS_INVALIDAS',
      });
    }

    if (endTime <= startTime) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'La hora de salida debe ser posterior a la hora de entrada',
        code: 'JORNADA_FECHAS_INVALIDAS',
      });
    }

    if (dto.employeeId !== undefined && dto.employeeId !== session.employeeId) {
      const newEmployee = await this.prisma.employee.findUnique({
        where: { id: dto.employeeId },
      });
      if (!newEmployee) {
        throw new NotFoundException({
          statusCode: 404,
          message: `Empleado con ID ${dto.employeeId} no encontrado`,
          code: 'EMPLEADO_NO_ENCONTRADO',
        });
      }
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        workConfig: { include: { ordinaryDistributions: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Empleado con ID ${employeeId} no encontrado`,
        code: 'EMPLEADO_NO_ENCONTRADO',
      });
    }

    const holidays = await this.prisma.holiday.findMany({
      select: { date: true },
    });

    const config = employee.workConfig;
    const ordinaryDistributions =
      config?.ordinaryDistributions?.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        ordinaryMinutesCap: d.ordinaryMinutesCap,
      })) ?? [];

    const accumulatedWeekMinutes = await this.getAccumulatedWeekMinutes(
      employee.id,
      startTime,
    );

    const classification = this.engine.classify({
      startTime,
      endTime,
      ordinaryDistributions,
      holidays: holidays.map((h) => h.date),
      workModality: employee?.workModality ?? 'ADMINISTRATIVO',
      weeklyTargetMinutes:
        employee?.weeklyTargetMinutes ?? config?.weeklyTargetMinutes ?? 2520,
      accumulatedWeekMinutes,
      breakMinutes: config?.breakMinutes ?? 60,
      breakThresholdMinutes: config?.breakThresholdMinutes ?? null,
    });

    const prismaData = this.mapToPrismaData(classification);

    const updated = await this.prisma.workSession.update({
      where: { id },
      data: {
        employeeId,
        ...(dto.startTime ? { startTime } : {}),
        ...(dto.endTime ? { endTime } : {}),
        ...(dto.restDayWorked !== undefined
          ? { restDayWorked: dto.restDayWorked }
          : {}),
        ...prismaData,
      },
      include: { employee: true },
    });

    this.audit.log({
      userId,
      action: 'ACTUALIZAR',
      entity: 'Jornada',
      entityId: id,
      oldValues: {
        employeeId: session.employeeId,
        startTime: session.startTime,
        endTime: session.endTime,
      },
      newValues: { employeeId, startTime, endTime },
    });

    return updated;
  }

  async void(id: number, dto: VoidWorkSessionDto, userId?: number) {
    const session = await this.findOne(id);

    if (session.isVoided) {
      throw new ConflictException({
        statusCode: 409,
        message: 'La jornada ya se encuentra anulada',
        code: 'JORNADA_YA_ANULADA',
      });
    }

    const voided = await this.prisma.workSession.update({
      where: { id },
      data: {
        isVoided: true,
        voidedAt: new Date(),
        voidedReason: dto.reason,
      },
      include: { employee: true },
    });

    this.audit.log({
      userId,
      action: 'ANULAR',
      entity: 'Jornada',
      entityId: id,
      newValues: { reason: dto.reason },
    });

    return voided;
  }

  async setCompensatoryDecision(
    id: number,
    dto: CompensatoryDecisionDto,
    userId?: number,
  ) {
    if (!userId) {
      throw new ForbiddenException({
        statusCode: 403,
        message:
          'Se requiere usuario autenticado para registrar decisión compensatoria',
        code: 'USUARIO_REQUERIDO',
      });
    }

    const session = await this.findOne(id);

    if (session.isVoided) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'No se puede compensar una jornada anulada',
        code: 'JORNADA_ANULADA',
      });
    }

    const updated = await this.prisma.workSession.update({
      where: { id },
      data: {
        compensatoryType: dto.compensatoryType,
        compensatoryUserId: userId,
        compensatoryDecisionDate: new Date(),
        compensatoryHours: dto.compensatoryHours,
        compensatoryObservation: dto.compensatoryObservation,
      },
      include: { employee: true },
    });

    this.audit.log({
      userId,
      action: 'DECISION_COMPENSATORIO',
      entity: 'Jornada',
      entityId: id,
      oldValues: {
        compensatoryType: session.compensatoryType,
        compensatoryObservation: session.compensatoryObservation,
      },
      newValues: {
        compensatoryType: dto.compensatoryType,
        compensatoryObservation: dto.compensatoryObservation,
      },
    });

    return updated;
  }

  async recalculate(id: number, userId?: number) {
    const session = await this.findOne(id);

    if (session.isVoided) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'No se puede recalcular una jornada anulada',
        code: 'JORNADA_ANULADA',
      });
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: session.employeeId },
      include: {
        workConfig: { include: { ordinaryDistributions: true } },
      },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Empleado con ID ${session.employeeId} no encontrado`,
        code: 'EMPLEADO_NO_ENCONTRADO',
      });
    }

    const holidays = await this.prisma.holiday.findMany({
      select: { date: true },
    });

    const config = employee.workConfig;
    const ordinaryDistributions =
      config?.ordinaryDistributions?.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        ordinaryMinutesCap: d.ordinaryMinutesCap,
      })) ?? [];

    const accumulatedWeekMinutes = await this.getAccumulatedWeekMinutes(
      employee.id,
      session.startTime,
    );

    const classification = this.engine.classify({
      startTime: session.startTime,
      endTime: session.endTime,
      ordinaryDistributions,
      holidays: holidays.map((h) => h.date),
      workModality: employee?.workModality ?? 'ADMINISTRATIVO',
      weeklyTargetMinutes:
        employee?.weeklyTargetMinutes ?? config?.weeklyTargetMinutes ?? 2520,
      accumulatedWeekMinutes,
      breakMinutes: config?.breakMinutes ?? 60,
      breakThresholdMinutes: config?.breakThresholdMinutes ?? null,
    });

    const prismaData = this.mapToPrismaData(classification);

    const recalculated = await this.prisma.workSession.update({
      where: { id },
      data: { ...prismaData },
      include: { employee: true },
    });

    this.audit.log({
      userId,
      action: 'RECALCULAR',
      entity: 'Jornada',
      entityId: id,
      oldValues: { totalMinutes: session.totalMinutes },
      newValues: { totalMinutes: classification.totalMinutes },
    });

    return recalculated;
  }

  async getAccumulatedWeekMinutes(
    employeeId: number,
    referenceDate: Date,
  ): Promise<number> {
    const BOGOTA_OFFSET = 300;
    const localOffset = referenceDate.getTimezoneOffset();
    const bogota = new Date(
      referenceDate.getTime() + (localOffset - BOGOTA_OFFSET) * 60000,
    );

    const dayOfWeek = bogota.getDay();
    const monday = new Date(bogota);
    monday.setDate(bogota.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const bogotaMonday = new Date(
      monday.getTime() - (localOffset - BOGOTA_OFFSET) * 60000,
    );

    const result = await this.prisma.workSession.aggregate({
      where: {
        employeeId,
        isVoided: false,
        startTime: { gte: bogotaMonday, lt: referenceDate },
      },
      _sum: { totalMinutes: true },
    });

    const regularMinutes = result._sum.totalMinutes ?? 0;

    const overlappingSessions = await this.prisma.workSession.findMany({
      where: {
        employeeId,
        isVoided: false,
        startTime: { lt: bogotaMonday },
        endTime: { gt: bogotaMonday },
      },
    });

    let overlapMinutes = 0;
    for (const session of overlappingSessions) {
      const overlapEnd =
        session.endTime < referenceDate ? session.endTime : referenceDate;
      const overlapMs = overlapEnd.getTime() - bogotaMonday.getTime();
      overlapMinutes += Math.max(0, Math.round(overlapMs / 60000));
    }

    return regularMinutes + overlapMinutes;
  }
}
