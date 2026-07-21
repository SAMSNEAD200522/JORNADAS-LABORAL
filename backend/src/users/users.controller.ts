import { Controller, Get, Post, Patch, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Usuarios')
@Controller('usuarios')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(Role.ADMINISTRADOR)
  @Post()
  @ApiOperation({ summary: 'Crear un nuevo usuario' })
  @ApiCreatedResponse({ description: 'Usuario creado exitosamente' })
  create(@Body() dto: CreateUserDto, @CurrentUser('id') userId?: number) {
    return this.usersService.create(dto, userId);
  }

  @Roles(Role.ADMINISTRADOR)
  @Get()
  @ApiOperation({ summary: 'Listar usuarios con filtros' })
  @ApiOkResponse({ description: 'Lista de usuarios' })
  findAll(
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('role') role?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.usersService.findAll({
      search,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      role,
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
    });
  }

  @Roles(Role.ADMINISTRADOR)
  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de usuarios' })
  @ApiOkResponse({ description: 'Estadísticas de usuarios' })
  getStats() {
    return this.usersService.getStats();
  }

  @Roles(Role.ADMINISTRADOR)
  @Get(':id')
  @ApiOperation({ summary: 'Obtener un usuario por ID' })
  @ApiOkResponse({ description: 'Usuario encontrado' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Roles(Role.ADMINISTRADOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un usuario' })
  @ApiOkResponse({ description: 'Usuario actualizado exitosamente' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser('id') userId?: number,
  ) {
    return this.usersService.update(id, dto, userId);
  }

  @Roles(Role.ADMINISTRADOR)
  @Patch(':id/estado')
  @ApiOperation({ summary: 'Activar o desactivar un usuario' })
  @ApiOkResponse({ description: 'Estado del usuario actualizado' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('activo') activo: boolean,
    @CurrentUser('id') userId?: number,
  ) {
    return this.usersService.updateStatus(id, activo, userId);
  }

  @Roles(Role.ADMINISTRADOR)
  @Patch(':id/restablecer-contrasena')
  @ApiOperation({ summary: 'Restablecer contraseña de un usuario' })
  @ApiOkResponse({ description: 'Contraseña restablecida exitosamente' })
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
    @CurrentUser('id') userId?: number,
  ) {
    return this.usersService.resetPassword(id, dto.newPassword, userId);
  }
}
