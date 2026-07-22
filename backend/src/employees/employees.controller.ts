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
import {
  ApiTags,
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { QueryEmployeeDto } from './dto/query-employee.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Empleados')
@Controller('empleados')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Post()
  @ApiOperation({ summary: 'Crear un nuevo empleado' })
  @ApiCreatedResponse({ description: 'Empleado creado exitosamente' })
  create(@Body() dto: CreateEmployeeDto, @CurrentUser('id') userId?: number) {
    return this.employeesService.create(dto, userId);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @Get()
  @ApiOperation({ summary: 'Listar empleados con filtros y paginación' })
  @ApiOkResponse({ description: 'Lista paginada de empleados' })
  findAll(@Query() query: QueryEmployeeDto) {
    return this.employeesService.findAll(query);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA, Role.SUPERVISOR)
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un empleado por ID' })
  @ApiOkResponse({ description: 'Empleado encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.findOne(id);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un empleado' })
  @ApiOkResponse({ description: 'Empleado actualizado exitosamente' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser('id') userId?: number,
  ) {
    return this.employeesService.update(id, dto, userId);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Patch(':id/estado')
  @ApiOperation({ summary: 'Activar o desactivar un empleado' })
  @ApiOkResponse({ description: 'Estado del empleado actualizado' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('activo') activo: boolean,
    @CurrentUser('id') userId?: number,
  ) {
    return this.employeesService.updateStatus(id, activo, userId);
  }
}
