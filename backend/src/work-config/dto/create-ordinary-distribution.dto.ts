import { IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrdinaryDistributionDto {
  @ApiProperty({
    description: 'Día de la semana (0=Domingo, 1=Lunes...6=Sábado)',
  })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty({ description: 'Tope de minutos ordinarios para este día' })
  @IsInt()
  @Min(0)
  ordinaryMinutesCap: number;
}
