import { IsOptional, IsInt, IsDateString, Min, Max, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class WeeklyQueryDto {
  @ApiProperty({ description: 'Año', example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({ description: 'Número de semana ISO (1-53)', example: 28 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(53)
  week: number;

  @ApiPropertyOptional({ description: 'Filtrar por área' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ description: 'Filtrar por ID de empleado' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;
}

export class MonthlyQueryDto {
  @ApiProperty({ description: 'Año', example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year: number;

  @ApiProperty({ description: 'Número de mes (1-12)', example: 7 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiPropertyOptional({ description: 'Filtrar por área' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ description: 'Filtrar por ID de empleado' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;
}

export class RangeQueryDto {
  @ApiProperty({ description: 'Fecha inicio del rango', example: '2026-07-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Fecha fin del rango', example: '2026-07-31' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Filtrar por área' })
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional({ description: 'Filtrar por ID de empleado' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;
}
