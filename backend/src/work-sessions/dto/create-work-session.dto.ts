import { IsInt, IsDateString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWorkSessionDto {
  @ApiProperty({ description: 'ID del empleado', example: 1 })
  @IsInt()
  employeeId: number;

  @ApiProperty({ description: 'Fecha y hora de inicio (ISO 8601)', example: '2026-07-08T07:00:00.000Z' })
  @IsDateString()
  startTime: string;

  @ApiProperty({ description: 'Fecha y hora de fin (ISO 8601)', example: '2026-07-08T17:00:00.000Z' })
  @IsDateString()
  endTime: string;

  @ApiPropertyOptional({ description: 'Día de descanso trabajado', example: true })
  @IsOptional()
  @IsBoolean()
  restDayWorked?: boolean;
}
