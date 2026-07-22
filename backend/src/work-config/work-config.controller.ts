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
import { WorkConfigService } from './work-config.service';
import { CreateWorkConfigDto } from './dto/create-work-config.dto';
import { UpdateWorkConfigDto } from './dto/update-work-config.dto';
import { CreateOrdinaryDistributionDto } from './dto/create-ordinary-distribution.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Configuración laboral')
@Controller('configuracion-laboral')
export class WorkConfigController {
  constructor(private readonly service: WorkConfigService) {}

  @Post()
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Crear configuración laboral' })
  create(@Body() dto: CreateWorkConfigDto, @CurrentUser('id') userId?: number) {
    return this.service.create(dto, userId);
  }

  @Roles(Role.ADMINISTRADOR)
  @Get()
  @ApiOperation({ summary: 'Listar configuraciones laborales' })
  findAll() {
    return this.service.findAll();
  }

  @Roles(Role.ADMINISTRADOR)
  @Get(':id')
  @ApiOperation({ summary: 'Obtener configuración por ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Actualizar configuración laboral' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkConfigDto,
    @CurrentUser('id') userId?: number,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Patch(':id/estado')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Activar o desactivar configuración' })
  toggleStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId?: number,
  ) {
    return this.service.toggleStatus(id, userId);
  }

  @Post(':id/asignar/:empleadoId')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Asignar configuración a un empleado' })
  assignToEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Param('empleadoId', ParseIntPipe) employeeId: number,
    @CurrentUser('id') userId?: number,
  ) {
    return this.service.assignToEmployee(id, employeeId, userId);
  }

  // ─── OrdinaryDistribution ─────────────────────────────────────

  @Post(':configId/distribucion')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({
    summary: 'Crear o actualizar distribución ordinaria para un día',
  })
  upsertDistribution(
    @Param('configId', ParseIntPipe) configId: number,
    @Body() dto: CreateOrdinaryDistributionDto,
    @CurrentUser('id') userId?: number,
  ) {
    return this.service.upsertDistribution(configId, dto, userId);
  }

  @Roles(Role.ADMINISTRADOR)
  @Get(':configId/distribucion')
  @ApiOperation({ summary: 'Listar distribución ordinaria' })
  findDistributions(@Param('configId', ParseIntPipe) configId: number) {
    return this.service.findDistributions(configId);
  }

  @Delete(':configId/distribucion/:dayOfWeek')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Eliminar distribución de un día' })
  removeDistribution(
    @Param('configId', ParseIntPipe) configId: number,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @CurrentUser('id') userId?: number,
  ) {
    return this.service.removeDistribution(configId, dayOfWeek, userId);
  }
}
