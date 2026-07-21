import { IsString, IsOptional, IsEnum, IsInt, Min, MaxLength, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkModality } from '@prisma/client';

export class CreateWorkConfigDto {
  @ApiProperty({ description: 'Nombre de la configuración laboral' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Descripción' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @ApiProperty({ enum: WorkModality, description: 'Modalidad laboral' })
  @IsEnum(WorkModality)
  modality: WorkModality;

  @ApiPropertyOptional({ description: 'Minutos de descanso por jornada', default: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  breakMinutes?: number;

  @ApiPropertyOptional({ description: 'Umbral en minutos para aplicar descanso (Territorio)', default: 480 })
  @IsOptional()
  @IsInt()
  @Min(0)
  breakThresholdMinutes?: number;

  @ApiPropertyOptional({ description: 'Minutos semanales objetivo', default: 2520 })
  @IsOptional()
  @IsInt()
  @Min(0)
  weeklyTargetMinutes?: number;
}
