import { PartialType } from '@nestjs/swagger';
import { CreateWorkConfigDto } from './create-work-config.dto';

export class UpdateWorkConfigDto extends PartialType(CreateWorkConfigDto) {}
