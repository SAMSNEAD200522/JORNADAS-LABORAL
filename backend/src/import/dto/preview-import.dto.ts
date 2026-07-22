import { IsEnum, IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportModule } from '@prisma/client';

export class PreviewImportDto {
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
      'Crear automáticamente referencias (cargos, departamentos, etc.)',
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
}
