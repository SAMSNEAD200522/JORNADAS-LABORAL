import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { QueryEmployeeDto } from './dto/query-employee.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class EmployeesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateEmployeeDto, userId?: number) {
    if (dto.scheduleId) {
      const schedule = await this.prisma.schedule.findUnique({
        where: { id: dto.scheduleId },
      });
      if (!schedule) {
        throw new NotFoundException({
          statusCode: 404,
          message: `El horario con ID ${dto.scheduleId} no existe`,
          code: 'HORARIO_NO_ENCONTRADO',
        });
      }
    }

    if (dto.workConfigId) {
      const wc = await this.prisma.workConfig.findUnique({
        where: { id: dto.workConfigId },
      });
      if (!wc) {
        throw new NotFoundException({
          statusCode: 404,
          message: `La configuración laboral con ID ${dto.workConfigId} no existe`,
          code: 'CONFIG_NO_ENCONTRADA',
        });
      }
    }

    let employee;
    try {
      employee = await this.prisma.employee.create({
        data: {
          documentType: dto.documentType,
          documentNumber: dto.documentNumber,
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          position: dto.position,
          area: dto.area,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
          scheduleId: dto.scheduleId,
          workConfigId: dto.workConfigId,
          workModality: dto.workModality,
          weeklyTargetMinutes: dto.weeklyTargetMinutes,
        },
        include: { schedule: true, workConfig: true },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: `El documento ${dto.documentNumber} ya está registrado`,
          code: 'DOCUMENTO_DUPLICADO',
        });
      }
      throw e;
    }

    this.audit.log({
      userId,
      action: 'CREAR',
      entity: 'Empleado',
      entityId: employee.id,
      newValues: dto as unknown as Record<string, unknown>,
    });

    return employee;
  }

  async findAll(query: QueryEmployeeDto) {
    const {
      search,
      documentNumber,
      firstName,
      lastName,
      isActive,
      area,
      position,
      page = 1,
      limit = 10,
      sortBy = 'id',
      sortOrder = 'asc',
    } = query;

    const where: Prisma.EmployeeWhereInput = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { documentNumber: { contains: search } },
      ];
    } else {
      if (firstName) where.firstName = { contains: firstName };
      if (lastName) where.lastName = { contains: lastName };
      if (documentNumber) where.documentNumber = { contains: documentNumber };
    }

    if (isActive !== undefined) where.isActive = isActive;
    if (area) where.area = { contains: area };
    if (position) where.position = { contains: position };

    const skip = (page - 1) * limit;

    const orderBy: Prisma.EmployeeOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: { schedule: true, workConfig: true },
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { schedule: true, workConfig: true },
    });

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Empleado con ID ${id} no encontrado`,
        code: 'EMPLEADO_NO_ENCONTRADO',
      });
    }

    return employee;
  }

  async update(id: number, dto: UpdateEmployeeDto, userId?: number) {
    const old = await this.findOne(id);

    if (dto.scheduleId) {
      const schedule = await this.prisma.schedule.findUnique({
        where: { id: dto.scheduleId },
      });
      if (!schedule) {
        throw new NotFoundException({
          statusCode: 404,
          message: `El horario con ID ${dto.scheduleId} no existe`,
          code: 'HORARIO_NO_ENCONTRADO',
        });
      }
    }

    if (dto.workConfigId) {
      const wc = await this.prisma.workConfig.findUnique({
        where: { id: dto.workConfigId },
      });
      if (!wc) {
        throw new NotFoundException({
          statusCode: 404,
          message: `La configuración laboral con ID ${dto.workConfigId} no existe`,
          code: 'CONFIG_NO_ENCONTRADA',
        });
      }
    }

    const employee = await this.prisma.employee.update({
      where: { id },
      data: {
        ...dto,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
      },
      include: { schedule: true, workConfig: true },
    });

    this.audit.log({
      userId,
      action: 'ACTUALIZAR',
      entity: 'Empleado',
      entityId: id,
      oldValues: old,
      newValues: dto as unknown as Record<string, unknown>,
    });

    return employee;
  }

  async updateStatus(id: number, isActive: boolean, userId?: number) {
    const old = await this.findOne(id);

    const employee = await this.prisma.employee.update({
      where: { id },
      data: { isActive },
      include: { schedule: true, workConfig: true },
    });

    this.audit.log({
      userId,
      action: isActive ? 'ACTIVAR' : 'DESACTIVAR',
      entity: 'Empleado',
      entityId: id,
      oldValues: { isActive: old.isActive },
      newValues: { isActive },
    });

    return employee;
  }
}
