import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { HolidaysService } from './holidays.service';
import { CreateHolidayDto } from './dto/create-holiday.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Festivos')
@Controller('festivos')
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @Post()
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Registrar un festivo' })
  create(@Body() dto: CreateHolidayDto, @CurrentUser('id') userId?: number) {
    return this.holidaysService.create(dto, userId);
  }

  @Get()
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Listar todos los festivos' })
  findAll() {
    return this.holidaysService.findAll();
  }

  @Get(':id')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Obtener un festivo por ID' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.holidaysService.findOne(id);
  }

  @Post('generar/:year')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Generar calendario de festivos colombianos para un año' })
  generateCalendar(
    @Param('year', ParseIntPipe) year: number,
    @CurrentUser('id') userId?: number,
  ) {
    return this.holidaysService.generateColombianCalendar(year, userId);
  }

  @Delete(':id')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Eliminar un festivo' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId?: number,
  ) {
    return this.holidaysService.remove(id, userId);
  }
}
