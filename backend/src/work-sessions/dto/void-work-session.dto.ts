import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VoidWorkSessionDto {
  @ApiProperty({
    description: 'Motivo de la anulación',
    example: 'Corrección por error en el registro',
  })
  @IsString()
  @MaxLength(500)
  reason: string;
}
