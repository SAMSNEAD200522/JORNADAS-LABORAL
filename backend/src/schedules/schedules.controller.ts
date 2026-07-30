import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { CreateScheduleDayDto } from './dto/create-schedule-day.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Horarios')
@Controller('horarios')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Post()
  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @ApiOperation({ summary: 'Crear un nuevo horario laboral' })
  create(@Body() dto: CreateScheduleDto, @CurrentUser('id') userId?: number) {
    return this.schedulesService.create(dto, userId);
  }

  @Get()
  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Listar todos los horarios' })
  findAll() {
    return this.schedulesService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Obtener un horario por ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.schedulesService.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @ApiOperation({ summary: 'Actualizar un horario' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateScheduleDto,
    @CurrentUser('id') userId?: number,
  ) {
    return this.schedulesService.update(id, dto, userId);
  }

  @Patch(':id/estado')
  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @ApiOperation({ summary: 'Activar o desactivar un horario' })
  toggleStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId?: number,
  ) {
    return this.schedulesService.toggleStatus(id, userId);
  }

  @Post(':id/asignar/:empleadoId')
  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @ApiOperation({ summary: 'Asignar horario a un empleado' })
  assignToEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Param('empleadoId', ParseIntPipe) employeeId: number,
    @CurrentUser('id') userId?: number,
  ) {
    return this.schedulesService.assignToEmployee(id, employeeId, userId);
  }

  // ─── ScheduleDay ─────────────────────────────────────────────

  @Post(':scheduleId/dias')
  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @ApiOperation({
    summary: 'Crear o actualizar configuración de un día del horario',
  })
  createDay(
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
    @Body() dto: CreateScheduleDayDto,
    @CurrentUser('id') userId?: number,
  ) {
    return this.schedulesService.createDay(scheduleId, dto, userId);
  }

  @Get(':scheduleId/dias')
  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @ApiOperation({ summary: 'Listar días configurados para un horario' })
  findDays(@Param('scheduleId', ParseIntPipe) scheduleId: number) {
    return this.schedulesService.findDays(scheduleId);
  }

  @Delete(':scheduleId/dias/:dayOfWeek')
  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @ApiOperation({ summary: 'Eliminar configuración de un día del horario' })
  removeDay(
    @Param('scheduleId', ParseIntPipe) scheduleId: number,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @CurrentUser('id') userId?: number,
  ) {
    return this.schedulesService.removeDay(scheduleId, dayOfWeek, userId);
  }
}
