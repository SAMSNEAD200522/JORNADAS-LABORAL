import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateWorkConfigDto } from './dto/create-work-config.dto';
import { UpdateWorkConfigDto } from './dto/update-work-config.dto';
import { CreateOrdinaryDistributionDto } from './dto/create-ordinary-distribution.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class WorkConfigService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateWorkConfigDto, userId?: number) {
    let config;
    try {
      config = await this.prisma.workConfig.create({
        data: {
          name: dto.name,
          description: dto.description,
          modality: dto.modality,
          breakMinutes: dto.breakMinutes ?? 60,
          breakThresholdMinutes: dto.breakThresholdMinutes,
          weeklyTargetMinutes: dto.weeklyTargetMinutes ?? 2520,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: `Ya existe una configuración con el nombre "${dto.name}"`,
          code: 'CONFIG_NOMBRE_DUPLICADO',
        });
      }
      throw e;
    }

    this.audit.log({
      userId,
      action: 'CREAR',
      entity: 'ConfiguracionLaboral',
      entityId: config.id,
      newValues: dto as unknown as Record<string, unknown>,
    });

    return config;
  }

  async findAll() {
    const data = await this.prisma.workConfig.findMany({
      include: {
        _count: { select: { employees: true } },
        ordinaryDistributions: { orderBy: { dayOfWeek: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    return data;
  }

  async findOne(id: number) {
    const config = await this.prisma.workConfig.findUnique({
      where: { id },
      include: {
        ordinaryDistributions: { orderBy: { dayOfWeek: 'asc' } },
      },
    });
    if (!config) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Configuración laboral con ID ${id} no encontrada`,
        code: 'CONFIG_NO_ENCONTRADA',
      });
    }
    return config;
  }

  async update(id: number, dto: UpdateWorkConfigDto, userId?: number) {
    await this.findOne(id);

    if (dto.name) {
      const dup = await this.prisma.workConfig.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (dup) {
        throw new ConflictException({
          statusCode: 409,
          message: `Ya existe una configuración con el nombre "${dto.name}"`,
          code: 'CONFIG_NOMBRE_DUPLICADO',
        });
      }
    }

    const config = await this.prisma.workConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.modality !== undefined ? { modality: dto.modality } : {}),
        ...(dto.breakMinutes !== undefined
          ? { breakMinutes: dto.breakMinutes }
          : {}),
        ...(dto.breakThresholdMinutes !== undefined
          ? { breakThresholdMinutes: dto.breakThresholdMinutes }
          : {}),
        ...(dto.weeklyTargetMinutes !== undefined
          ? { weeklyTargetMinutes: dto.weeklyTargetMinutes }
          : {}),
      },
    });

    this.audit.log({
      userId,
      action: 'ACTUALIZAR',
      entity: 'ConfiguracionLaboral',
      entityId: id,
      newValues: dto as unknown as Record<string, unknown>,
    });

    return config;
  }

  async toggleStatus(id: number, userId?: number) {
    const config = await this.findOne(id);
    const updated = await this.prisma.workConfig.update({
      where: { id },
      data: { isActive: !config.isActive },
    });

    this.audit.log({
      userId,
      action: updated.isActive ? 'ACTIVAR' : 'DESACTIVAR',
      entity: 'ConfiguracionLaboral',
      entityId: id,
      newValues: { isActive: updated.isActive },
    });

    return updated;
  }

  async assignToEmployee(
    configId: number,
    employeeId: number,
    userId?: number,
  ) {
    await this.findOne(configId);

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

    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: { workConfigId: configId },
    });

    this.audit.log({
      userId,
      action: 'ASIGNAR_CONFIGURACION',
      entity: 'Empleado',
      entityId: employeeId,
      newValues: { workConfigId: configId },
    });

    return updated;
  }

  // ─── OrdinaryDistribution ─────────────────────────────────────

  async upsertDistribution(
    configId: number,
    dto: CreateOrdinaryDistributionDto,
    userId?: number,
  ) {
    await this.findOne(configId);

    const dist = await this.prisma.ordinaryDistribution.upsert({
      where: {
        workConfigId_dayOfWeek: {
          workConfigId: configId,
          dayOfWeek: dto.dayOfWeek,
        },
      },
      update: { ordinaryMinutesCap: dto.ordinaryMinutesCap },
      create: {
        workConfigId: configId,
        dayOfWeek: dto.dayOfWeek,
        ordinaryMinutesCap: dto.ordinaryMinutesCap,
      },
    });

    this.audit.log({
      userId,
      action: 'ACTUALIZAR_DISTRIBUCION',
      entity: 'DistribucionOrdinaria',
      entityId: dist.id,
      newValues: dto as unknown as Record<string, unknown>,
    });

    return dist;
  }

  async findDistributions(configId: number) {
    await this.findOne(configId);
    return this.prisma.ordinaryDistribution.findMany({
      where: { workConfigId: configId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  async removeDistribution(
    configId: number,
    dayOfWeek: number,
    userId?: number,
  ) {
    await this.findOne(configId);

    const dist = await this.prisma.ordinaryDistribution.findUnique({
      where: { workConfigId_dayOfWeek: { workConfigId: configId, dayOfWeek } },
    });
    if (!dist) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Distribución para día ${dayOfWeek} no encontrada`,
        code: 'DISTRIBUCION_NO_ENCONTRADA',
      });
    }

    await this.prisma.ordinaryDistribution.delete({
      where: { workConfigId_dayOfWeek: { workConfigId: configId, dayOfWeek } },
    });

    this.audit.log({
      userId,
      action: 'ELIMINAR_DISTRIBUCION',
      entity: 'DistribucionOrdinaria',
      entityId: dist.id,
      newValues: { dayOfWeek },
    });
  }
}
