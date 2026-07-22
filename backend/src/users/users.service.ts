import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private static readonly MAIN_ADMIN_EMAIL = 'admin@empresa.com';

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(dto: CreateUserDto, userId?: number) {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          name: dto.name,
          passwordHash,
          role: dto.role,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException({
          statusCode: 409,
          message: `El correo ${dto.email} ya está registrado`,
          code: 'EMAIL_DUPLICADO',
        });
      }
      throw e;
    }

    this.audit.log({
      userId,
      action: 'CREAR',
      entity: 'Usuario',
      entityId: user.id,
      newValues: { email: dto.email, name: dto.name, role: dto.role },
    });

    return user;
  }

  async findAll(query?: {
    search?: string;
    isActive?: boolean;
    role?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, isActive, role, page = 1, limit = 10 } = query || {};

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }

    if (isActive !== undefined) where.isActive = isActive;
    if (role) where.role = role;

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'asc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Usuario con ID ${id} no encontrado`,
        code: 'USUARIO_NO_ENCONTRADO',
      });
    }

    return user;
  }

  async update(id: number, dto: UpdateUserDto, userId?: number) {
    const old = await this.findOne(id);

    if (dto.email && dto.email !== old.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existing) {
        throw new ConflictException({
          statusCode: 409,
          message: `El correo ${dto.email} ya está registrado`,
          code: 'EMAIL_DUPLICADO',
        });
      }
    }

    const updateData: any = {};
    if (dto.email) updateData.email = dto.email;
    if (dto.name) updateData.name = dto.name;
    if (dto.role) updateData.role = dto.role;
    if (dto.password)
      updateData.passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.audit.log({
      userId,
      action: 'ACTUALIZAR',
      entity: 'Usuario',
      entityId: id,
      oldValues: { email: old.email, name: old.name, role: old.role },
      newValues: {
        email: dto.email || old.email,
        name: dto.name || old.name,
        role: dto.role || old.role,
        passwordChanged: !!dto.password,
      },
    });

    return user;
  }

  async updateStatus(id: number, isActive: boolean, userId?: number) {
    const old = await this.findOne(id);

    if (!isActive && old.email === UsersService.MAIN_ADMIN_EMAIL) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'La cuenta administradora principal no puede desactivarse',
        code: 'ADMIN_PRINCIPAL_NO_DESACTIVABLE',
      });
    }

    if (!isActive) {
      const activeAdminCount = await this.prisma.user.count({
        where: { role: 'ADMINISTRADOR', isActive: true },
      });
      const isTargetAdmin = old.role === 'ADMINISTRADOR';
      if (isTargetAdmin && activeAdminCount <= 1) {
        throw new ForbiddenException({
          statusCode: 403,
          message:
            'Debe existir al menos un administrador activo en el sistema',
          code: 'ADMIN_REQUERIDO',
        });
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.audit.log({
      userId,
      action: isActive ? 'ACTIVAR' : 'DESACTIVAR',
      entity: 'Usuario',
      entityId: id,
      oldValues: { isActive: old.isActive },
      newValues: { isActive },
    });

    return user;
  }

  async resetPassword(id: number, newPassword: string, userId?: number) {
    const user = await this.findOne(id);

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id },
      data: { passwordHash },
    });

    this.audit.log({
      userId,
      action: 'RESTABLECER_CONTRASEÑA',
      entity: 'Usuario',
      entityId: id,
      oldValues: {},
      newValues: {},
    });

    return { message: 'Contraseña actualizada exitosamente' };
  }

  async getStats() {
    const [total, active, byRole] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { role: true },
      }),
    ]);

    return {
      total,
      active,
      inactive: total - active,
      byRole: byRole.reduce(
        (acc, item) => {
          acc[item.role] = item._count.role;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }
}
