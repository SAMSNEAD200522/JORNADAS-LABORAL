import { IsEnum, IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportModule } from '@prisma/client';

export class ExecuteImportDto {
  @ApiProperty({
    description: 'Ruta del archivo a importar',
    example: '/path/to/file.xlsx',
  })
  @IsString()
  filePath: string;

  @ApiProperty({
    enum: ImportModule,
    description: 'Módulo destino de la importación',
    example: ImportModule.EMPLOYEES,
  })
  @IsEnum(ImportModule)
  module: ImportModule;

  @ApiPropertyOptional({
    description:
      'Crear automáticamente referencias (cargos, departamentos, empresas, centros de costo)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  autoCreateReferences?: boolean;

  @ApiPropertyOptional({
    description: 'Actualizar registros existentes por número de documento',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  updateExisting?: boolean;

  @ApiPropertyOptional({
    description: 'Modo simulación (sin escribir en la base de datos)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
