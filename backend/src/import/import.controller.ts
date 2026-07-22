import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Res,
  ParseIntPipe,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiQuery,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Role, ImportModule } from '@prisma/client';
import { ImportService } from './import.service';
import { PreviewImportDto } from './dto/preview-import.dto';
import { ExecuteImportDto } from './dto/execute-import.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Importación')
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiOperation({ summary: 'Subir archivo para importación' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ description: 'Ruta del archivo guardado' })
  uploadFile(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'No se proporcionó ningún archivo',
        code: 'ARCHIVO_REQUERIDO',
      });
    }
    const result = this.importService.handleFileUpload(file);
    return result;
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Post('preview')
  @ApiOperation({
    summary: 'Vista previa de importación (validación sin escribir)',
  })
  @ApiOkResponse({ description: 'Resultado de la validación' })
  preview(@Body() dto: PreviewImportDto) {
    return this.importService.previewImport(dto);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Post('execute')
  @ApiOperation({ summary: 'Ejecutar importación con backup y auditoría' })
  @ApiCreatedResponse({ description: 'Resultado de la importación' })
  execute(@Body() dto: ExecuteImportDto, @CurrentUser('id') userId?: number) {
    return this.importService.executeImport(dto, userId);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Post('template/work-sessions')
  @ApiOperation({ summary: 'Generar plantilla de jornadas laborales' })
  @ApiOkResponse({ description: 'Archivo Excel de plantilla' })
  generateWorkSessionTemplate(
    @Body() body: { month?: number; year?: number },
    @Res() res: Response,
  ) {
    const buffer = this.importService.generateWorkSessionTemplate();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla_jornadas.xlsx"',
    });
    res.send(buffer);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Get('employees/template')
  @ApiOperation({ summary: 'Descargar plantilla de importación de empleados' })
  @ApiOkResponse({ description: 'Archivo Excel de plantilla' })
  getEmployeeTemplate(@Res() res: Response) {
    const buffer = this.importService.generateEmployeeTemplate();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla_empleados.xlsx"',
    });
    res.send(buffer);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Post('employees/export')
  @ApiOperation({ summary: 'Exportar empleados usando la misma plantilla' })
  @ApiOkResponse({ description: 'Archivo Excel con datos de empleados' })
  async exportEmployees(
    @Body() body: { isActive?: boolean; department?: string },
    @Res() res: Response,
  ) {
    const buffer = await this.importService.exportEmployees();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="exportacion_empleados.xlsx"',
    });
    res.send(buffer);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Get('history')
  @ApiOperation({ summary: 'Historial de importaciones' })
  @ApiOkResponse({ description: 'Historial paginado' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'module', required: false })
  getHistory(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('module') module?: string,
  ) {
    return this.importService.getImportHistory({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      module: module as ImportModule | undefined,
    });
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Get('history/:id/errors')
  @ApiOperation({ summary: 'Obtener errores de una importación específica' })
  @ApiOkResponse({ description: 'Lista de errores' })
  getImportErrors(@Param('id', ParseIntPipe) id: number) {
    return this.importService.getImportErrors(id);
  }

  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @Get('history/:id/error-report')
  @ApiOperation({ summary: 'Descargar informe de errores en Excel' })
  @ApiOkResponse({ description: 'Archivo Excel con informe de errores' })
  async downloadErrorReport(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const buffer = await this.importService.generateErrorReport(id);
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="informe_errores_${id}.xlsx"`,
    });
    res.send(buffer);
  }

  @Roles(Role.ADMINISTRADOR)
  @Post('rollback')
  @ApiOperation({ summary: 'Revertir importación desde backup' })
  @ApiOkResponse({ description: 'Importación revertida exitosamente' })
  rollback(
    @Body() body: { importHistoryId: number },
    @CurrentUser('id') userId?: number,
  ) {
    return this.importService.rollbackImport(body.importHistoryId, userId);
  }
}
