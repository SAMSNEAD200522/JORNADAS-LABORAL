import {
  IsInt,
  IsString,
  IsOptional,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateScheduleDayDto {
  @ApiProperty({
    description: 'Día de la semana (0=Domingo, 1=Lunes... 6=Sábado)',
    example: 1,
    minimum: 0,
    maximum: 6,
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ description: 'Hora de entrada (HH:mm)', example: '08:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Formato de hora inválido (use HH:mm)',
  })
  startTime: string;

  @ApiProperty({ description: 'Hora de salida (HH:mm)', example: '18:00' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'Formato de hora inválido (use HH:mm)',
  })
  endTime: string;

  @ApiPropertyOptional({ description: 'Minutos de descanso', example: 60 })
  @IsOptional()
  @IsInt()
  @Min(0)
  breakMinutes?: number;
}
