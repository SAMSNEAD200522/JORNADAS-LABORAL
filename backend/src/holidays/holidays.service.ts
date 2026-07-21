import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';

@Injectable()
export class HolidaysService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateHolidayDto, userId?: number) {
    const [year, month, day] = dto.date.split('-').map(Number);
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);

    let holiday;
    try {
      holiday = await this.prisma.holiday.create({
        data: { date, name: dto.name },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: `Ya existe un festivo registrado en la fecha ${dto.date}`,
          code: 'FESTIVO_DUPLICADO',
        });
      }
      throw e;
    }

    this.audit.log({
      userId,
      action: 'CREAR',
      entity: 'Festivo',
      entityId: holiday.id,
      newValues: { date: dto.date, name: dto.name },
    });

    return holiday;
  }

  async findAll() {
    return this.prisma.holiday.findMany({
      orderBy: { date: 'asc' },
    });
  }

  async findOne(id: number) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });

    if (!holiday) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Festivo con ID ${id} no encontrado`,
        code: 'FESTIVO_NO_ENCONTRADO',
      });
    }

    return holiday;
  }

  async remove(id: number, userId?: number) {
    const old = await this.findOne(id);
    await this.prisma.holiday.delete({ where: { id } });

    this.audit.log({
      userId,
      action: 'ELIMINAR',
      entity: 'Festivo',
      entityId: id,
      oldValues: { date: old.date, name: old.name },
    });
  }
}
