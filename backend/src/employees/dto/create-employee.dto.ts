import { IsEnum, IsString, IsOptional, IsEmail, IsInt, IsDateString, MinLength, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeDocumentType, WorkModality } from '@prisma/client';

export class CreateEmployeeDto {
  @ApiProperty({ enum: EmployeeDocumentType, description: 'Tipo de documento', example: 'CC' })
  @IsEnum(EmployeeDocumentType)
  documentType: EmployeeDocumentType;

  @ApiProperty({ description: 'Número de documento', example: '1234567890' })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  documentNumber: string;

  @ApiProperty({ description: 'Nombres del empleado', example: 'Carlos Andrés' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ description: 'Apellidos del empleado', example: 'Ramírez Pérez' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName: string;

  @ApiPropertyOptional({ description: 'Correo electrónico', example: 'carlos.ramirez@empresa.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ description: 'Teléfono', example: '3001234567' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ description: 'Cargo del empleado', example: 'Desarrollador Senior' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;

  @ApiPropertyOptional({ description: 'Área del empleado', example: 'Tecnología' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string;

  @ApiPropertyOptional({ description: 'Fecha de ingreso', example: '2026-01-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional({ description: 'ID del horario asignado', example: 1 })
  @IsOptional()
  @IsInt()
  scheduleId?: number;

  @ApiPropertyOptional({ description: 'ID de la configuración laboral', example: 1 })
  @IsOptional()
  @IsInt()
  workConfigId?: number;

  @ApiPropertyOptional({ enum: WorkModality, description: 'Modalidad laboral', example: 'ADMINISTRATIVO', default: 'ADMINISTRATIVO' })
  @IsOptional()
  @IsEnum(WorkModality)
  workModality?: WorkModality;

  @ApiPropertyOptional({ description: 'Minutos semanales objetivo (ej: 2520 = 42h)', example: 2520, default: 2520 })
  @IsOptional()
  @IsInt()
  @Min(1)
  weeklyTargetMinutes?: number;
}
