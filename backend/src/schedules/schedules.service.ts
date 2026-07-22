import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { CreateScheduleDayDto } from './dto/create-schedule-day.dto';

@Injectable()
export class SchedulesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateScheduleDto, userId?: number) {
    let schedule;
    try {
      schedule = await this.prisma.schedule.create({ data: dto });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: `Ya existe un horario con el nombre "${dto.name}"`,
          code: 'HORARIO_DUPLICADO',
        });
      }
      throw e;
    }

    this.audit.log({
      userId,
      action: 'CREAR',
      entity: 'Horario',
      entityId: schedule.id,
      newValues: dto as unknown as Record<string, unknown>,
    });

    return schedule;
  }

  async findAll() {
    return this.prisma.schedule.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { employees: true } } },
    });
  }

  async findOne(id: number) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });

    if (!schedule) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Horario con ID ${id} no encontrado`,
        code: 'HORARIO_NO_ENCONTRADO',
      });
    }

    return schedule;
  }

  async update(id: number, dto: UpdateScheduleDto, userId?: number) {
    const old = await this.findOne(id);

    if (dto.name) {
      const existing = await this.prisma.schedule.findFirst({
        where: {
          name: { equals: dto.name },
          id: { not: id },
        },
      });
      if (existing) {
        throw new ConflictException({
          statusCode: 409,
          message: `Ya existe un horario con el nombre "${dto.name}"`,
          code: 'HORARIO_DUPLICADO',
        });
      }
    }

    const schedule = await this.prisma.schedule.update({
      where: { id },
      data: dto,
    });

    this.audit.log({
      userId,
      action: 'ACTUALIZAR',
      entity: 'Horario',
      entityId: id,
      oldValues: old,
      newValues: dto as unknown as Record<string, unknown>,
    });

    return schedule;
  }

  async toggleStatus(id: number, userId?: number) {
    const schedule = await this.findOne(id);
    const updated = await this.prisma.schedule.update({
      where: { id },
      data: { isActive: !schedule.isActive },
      include: { _count: { select: { employees: true } } },
    });

    this.audit.log({
      userId,
      action: updated.isActive ? 'ACTIVAR' : 'DESACTIVAR',
      entity: 'Horario',
      entityId: id,
      oldValues: { isActive: schedule.isActive },
      newValues: { isActive: updated.isActive },
    });

    return updated;
  }

  async assignToEmployee(
    scheduleId: number,
    employeeId: number,
    userId?: number,
  ) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Horario con ID ${scheduleId} no encontrado`,
        code: 'HORARIO_NO_ENCONTRADO',
      });
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
    });
    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Empleado con ID ${employeeId} no encontrado`,
        code: 'EMPLEADO_NO_ENCONTRADO',
      });
    }

    const result = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { scheduleId },
      include: { schedule: true },
    });

    this.audit.log({
      userId,
      action: 'ASIGNAR_HORARIO',
      entity: 'Empleado',
      entityId: employeeId,
      newValues: { scheduleId, scheduleName: schedule.name },
    });

    return result;
  }

  // ─── ScheduleDay CRUD ───────────────────────────────────────

  async createDay(
    scheduleId: number,
    dto: CreateScheduleDayDto,
    userId?: number,
  ) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Horario con ID ${scheduleId} no encontrado`,
        code: 'HORARIO_NO_ENCONTRADO',
      });
    }

    if (dto.startTime >= dto.endTime) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'La hora de salida debe ser posterior a la hora de entrada',
        code: 'HORAS_INVALIDAS',
      });
    }

    const day = await this.prisma.scheduleDay.upsert({
      where: { scheduleId_dayOfWeek: { scheduleId, dayOfWeek: dto.dayOfWeek } },
      update: {
        startTime: dto.startTime,
        endTime: dto.endTime,
        breakMinutes: dto.breakMinutes,
      },
      create: {
        scheduleId,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        breakMinutes: dto.breakMinutes,
      },
    });

    this.audit.log({
      userId,
      action: 'CREAR_ACTUALIZAR_DIA_HORARIO',
      entity: 'Horario',
      entityId: scheduleId,
      newValues: dto as unknown as Record<string, unknown>,
    });

    return day;
  }

  async findDays(scheduleId: number) {
    await this.findOne(scheduleId);
    return this.prisma.scheduleDay.findMany({
      where: { scheduleId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async removeDay(scheduleId: number, dayOfWeek: number, userId?: number) {
    await this.findOne(scheduleId);

    const day = await this.prisma.scheduleDay.findUnique({
      where: { scheduleId_dayOfWeek: { scheduleId, dayOfWeek } },
    });
    if (!day) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Día ${dayOfWeek} no configurado para el horario ${scheduleId}`,
        code: 'DIA_NO_ENCONTRADO',
      });
    }

    await this.prisma.scheduleDay.delete({
      where: { scheduleId_dayOfWeek: { scheduleId, dayOfWeek } },
    });

    this.audit.log({
      userId,
      action: 'ELIMINAR_DIA_HORARIO',
      entity: 'Horario',
      entityId: scheduleId,
      oldValues: { dayOfWeek },
    });
  }
}
