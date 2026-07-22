import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { WorkSessionsService } from './work-sessions.service';
import { AuditEngineService } from '../audit-engine/audit-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkSessionDto } from './dto/create-work-session.dto';
import { UpdateWorkSessionDto } from './dto/update-work-session.dto';
import { QueryWorkSessionDto } from './dto/query-work-session.dto';
import { VoidWorkSessionDto } from './dto/void-work-session.dto';
import { CompensatoryDecisionDto } from './dto/compensatory-decision.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { NotFoundException } from '@nestjs/common';

@ApiTags('Jornadas')
@Controller('jornadas')
export class WorkSessionsController {
  constructor(
    private readonly workSessionsService: WorkSessionsService,
    private readonly auditEngine: AuditEngineService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @Post()
  @ApiOperation({ summary: 'Registrar una jornada laboral' })
  create(
    @Body() dto: CreateWorkSessionDto,
    @CurrentUser('id') userId?: number,
  ) {
    return this.workSessionsService.create(dto, userId);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @Get()
  @ApiOperation({ summary: 'Listar jornadas con filtros y paginación' })
  findAll(@Query() query: QueryWorkSessionDto) {
    return this.workSessionsService.findAll(query);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @Get(':id')
  @ApiOperation({ summary: 'Obtener una jornada por ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.workSessionsService.findOne(id);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una jornada' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkSessionDto,
    @CurrentUser('id') userId?: number,
  ) {
    return this.workSessionsService.update(id, dto, userId);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Patch(':id/anular')
  @ApiOperation({ summary: 'Anular una jornada' })
  void(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VoidWorkSessionDto,
    @CurrentUser('id') userId?: number,
  ) {
    return this.workSessionsService.void(id, dto, userId);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Post(':id/recalcular')
  @ApiOperation({ summary: 'Recalcular clasificación de una jornada' })
  recalculate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId?: number,
  ) {
    return this.workSessionsService.recalculate(id, userId);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Patch(':id/compensatorio')
  @ApiOperation({
    summary: 'Registrar decisión compensatoria sobre una jornada',
  })
  setCompensatoryDecision(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompensatoryDecisionDto,
    @CurrentUser('id') userId?: number,
  ) {
    return this.workSessionsService.setCompensatoryDecision(id, dto, userId);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @Post(':id/auditoria')
  @ApiOperation({
    summary:
      'Auditar una jornada — traza paso a paso del motor de clasificación',
  })
  async audit(@Param('id', ParseIntPipe) id: number) {
    const session = await this.prisma.workSession.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            workConfig: { include: { ordinaryDistributions: true } },
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Jornada con ID ${id} no encontrada`,
        code: 'JORNADA_NO_ENCONTRADA',
      });
    }

    const holidays = await this.prisma.holiday.findMany({
      select: { date: true },
    });
    const config = session.employee.workConfig;
    const ordinaryDistributions =
      config?.ordinaryDistributions?.map((d) => ({
        dayOfWeek: d.dayOfWeek,
        ordinaryMinutesCap: d.ordinaryMinutesCap,
      })) ?? [];

    const accumulatedWeekMinutes =
      await this.workSessionsService.getAccumulatedWeekMinutes(
        session.employeeId,
        session.startTime,
      );

    return this.auditEngine.trace(
      {
        startTime: session.startTime,
        endTime: session.endTime,
        ordinaryDistributions,
        holidays: holidays.map((h) => h.date),
        workModality: session.employee.workModality,
        weeklyTargetMinutes:
          session.employee.weeklyTargetMinutes ??
          config?.weeklyTargetMinutes ??
          2520,
        accumulatedWeekMinutes,
        breakMinutes: config?.breakMinutes ?? 60,
        breakThresholdMinutes: config?.breakThresholdMinutes ?? null,
      },
      {
        id: session.employee.id,
        name: `${session.employee.firstName} ${session.employee.lastName}`,
        documentNumber: session.employee.documentNumber,
        modality: session.employee.workModality,
        configName: config?.name ?? 'Sin configuración',
      },
    );
  }
}
