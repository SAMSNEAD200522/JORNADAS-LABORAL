import { IsString, IsOptional, IsInt, Min, MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateScheduleDto {
  @ApiProperty({ description: 'Nombre del horario', example: 'Administrativo' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Hora de entrada (HH:mm)', example: '07:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora de entrada debe estar en formato HH:mm' })
  startTime: string;

  @ApiProperty({ description: 'Hora de salida (HH:mm)', example: '17:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'La hora de salida debe estar en formato HH:mm' })
  endTime: string;

  @ApiProperty({ description: 'Días laborales (ej: 1,2,3,4,5 para lun-vie)', example: '1,2,3,4,5' })
  @IsString()
  @Matches(/^[1-7](,[1-7])*$/, { message: 'Los días laborales deben ser números del 1 al 7 separados por coma' })
  workDays: string;

  @ApiPropertyOptional({ description: 'Tiempo de descanso en minutos', example: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  breakMinutes?: number;
}
