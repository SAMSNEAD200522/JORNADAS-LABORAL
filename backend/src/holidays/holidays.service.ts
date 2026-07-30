import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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

  async generateColombianCalendar(year: number, userId?: number) {
    if (year < 2000 || year > 2100) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'El año debe estar entre 2000 y 2100',
        code: 'AÑO_INVALIDO',
      });
    }

    const fixed = this.getFixedHolidays(year);
    const easter = this.easterDate(year);
    const holyWeek = this.getHolyWeekHolidays(year, easter);
    const emiliani = this.getEmilianiHolidays(year, easter);
    const ascensionDate = this.moveHoliday(easter, 39);
    const corpusChristiDate = this.moveHoliday(easter, 60);
    const sacredHeartDate = this.moveHoliday(easter, 68);

    const movable = [
      { date: this.formatDate(ascensionDate), name: 'Ascensión del Señor' },
      { date: this.formatDate(corpusChristiDate), name: 'Corpus Christi' },
      { date: this.formatDate(sacredHeartDate), name: 'Sagrado Corazón de Jesús' },
    ].filter((h) => !h.date.startsWith(`${year}-01-01`));

    const allHolidays = [...fixed, ...holyWeek, ...emiliani, ...movable];
    const uniqueByDate = new Map<string, { date: string; name: string }>();
    for (const h of allHolidays) {
      if (!uniqueByDate.has(h.date)) {
        uniqueByDate.set(h.date, h);
      }
    }

    const holidays = Array.from(uniqueByDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );

    let created = 0;
    let skipped = 0;

    for (const h of holidays) {
      const [y, m, d] = h.date.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d, 0, 0, 0, 0);
      try {
        await this.prisma.holiday.create({
          data: { date: dateObj, name: h.name },
        });
        created++;
      } catch (e: any) {
        if (e?.code === 'P2002') {
          skipped++;
        } else {
          throw e;
        }
      }
    }

    this.audit.log({
      userId,
      action: 'GENERAR_CALENDARIO',
      entity: 'Festivo',
      newValues: { year, created, skipped, total: holidays.length },
    });

    return {
      year,
      created,
      skipped,
      total: holidays.length,
      holidays,
    };
  }

  private getFixedHolidays(year: number): Array<{ date: string; name: string }> {
    return [
      { date: `${year}-01-01`, name: 'Año Nuevo' },
      { date: `${year}-05-01`, name: 'Día del Trabajo' },
      { date: `${year}-07-20`, name: 'Día de la Independencia' },
      { date: `${year}-08-07`, name: 'Batalla de Boyacá' },
      { date: `${year}-12-08`, name: 'Inmaculada Concepción' },
      { date: `${year}-12-25`, name: 'Navidad de Jesús' },
    ];
  }

  private getHolyWeekHolidays(year: number, easter: Date): Array<{ date: string; name: string }> {
    return [
      {
        date: this.formatDate(this.moveHoliday(easter, -3)),
        name: 'Jueves Santo',
      },
      {
        date: this.formatDate(this.moveHoliday(easter, -2)),
        name: 'Viernes Santo',
      },
      {
        date: this.formatDate(this.moveHoliday(easter, 0)),
        name: 'Pascua de Resurrección',
      },
    ];
  }

  private getEmilianiHolidays(year: number, easter: Date): Array<{ date: string; name: string }> {
    const dates: Array<{ date: string; name: string }> = [];
    const emilianiNames = [
      'San José',
      'San Pedro y San Pablo',
      'Asunción de la Virgen',
      'San Francisco de Asís',
      'San Martín de Porres',
      'Todos los Santos',
      'San Carlos Borromeo',
    ];
    const emilianiMonths = [2, 5, 7, 9, 10, 10, 11];
    const emilianiDays = [19, 29, 15, 4, 16, 1, 3];

    for (let i = 0; i < emilianiNames.length; i++) {
      const d = new Date(year, emilianiMonths[i], emilianiDays[i]);
      dates.push({
        date: this.formatDate(d),
        name: emilianiNames[i],
      });
    }

    return dates;
  }

  private moveHoliday(from: Date, days: number): Date {
    const result = new Date(from);
    result.setDate(result.getDate() + days);
    return result;
  }

  private easterDate(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
