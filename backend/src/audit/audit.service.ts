import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    userId?: number;
    action: string;
    entity: string;
    entityId?: number;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
  }) {
    return this.prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        oldValues: params.oldValues as any,
        newValues: params.newValues as any,
      },
    });
  }

  async findAll(query: {
    page?: number;
    limit?: number;
    entity?: string;
    entityId?: number;
    userId?: number;
  }) {
    const { page = 1, limit = 20, entity, entityId, userId } = query;

    const where: Prisma.AuditLogWhereInput = {};
    if (entity) where.entity = entity;
    if (entityId) where.entityId = entityId;
    if (userId) where.userId = userId;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, role: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
