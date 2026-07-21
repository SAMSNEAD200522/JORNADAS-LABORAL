import { PartialType, PickType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateWorkSessionDto } from './create-work-session.dto';

export class UpdateWorkSessionDto extends PartialType(
  PickType(CreateWorkSessionDto, ['employeeId', 'startTime', 'endTime'] as const),
) {
  @ApiPropertyOptional({ description: 'Día de descanso trabajado', example: true })
  @IsOptional()
  @IsBoolean()
  restDayWorked?: boolean;
}
