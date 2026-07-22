import { IsString, IsDateString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateHolidayDto {
  @ApiProperty({ description: 'Fecha del festivo', example: '2026-07-20' })
  @IsDateString()
  date: string;

  @ApiProperty({
    description: 'Nombre del festivo',
    example: 'Día de la Independencia',
  })
  @IsString()
  @MaxLength(200)
  name: string;
}
