import {
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CompensatoryType } from '@prisma/client';

export class CompensatoryDecisionDto {
  @ApiProperty({
    enum: CompensatoryType,
    description: 'Tipo de compensatorio',
    example: 'PENDIENTE_DEFINICION',
  })
  @IsEnum(CompensatoryType)
  compensatoryType: CompensatoryType;

  @ApiPropertyOptional({ description: 'Minutos compensados', example: 480 })
  @IsOptional()
  @IsInt()
  @Min(0)
  compensatoryHours?: number;

  @ApiPropertyOptional({
    description: 'Observación',
    example: 'Se compensa con día de descanso el próximo sábado',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  compensatoryObservation?: string;
}
