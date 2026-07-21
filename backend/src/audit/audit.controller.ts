import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Auditoría')
@Controller('auditoria')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(Role.ADMINISTRADOR, Role.GESTION_HUMANA)
  @ApiOperation({ summary: 'Consultar registros de auditoría' })
  findAll(@Query() query: QueryAuditDto) {
    return this.auditService.findAll(query);
  }
}
