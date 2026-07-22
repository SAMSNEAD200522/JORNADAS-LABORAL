import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
  };

  const mockAudit = {
    log: jest.fn(),
  };

  const userSelectResult = {
    id: 1,
    email: 'test@test.com',
    name: 'Test User',
    role: Role.GESTION_HUMANA,
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('create', () => {
    const dto = {
      email: 'nuevo@test.com',
      name: 'Nuevo Usuario',
      password: 'password123',
      role: Role.GESTION_HUMANA,
    };

    it('debe crear un usuario exitosamente', async () => {
      mockPrisma.user.create.mockResolvedValue(userSelectResult);

      const result = await service.create(dto, 1);

      expect(result).toEqual(userSelectResult);
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'nuevo@test.com',
            name: 'Nuevo Usuario',
            passwordHash: 'hashed_password',
            role: Role.GESTION_HUMANA,
          }),
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          action: 'CREAR',
          entity: 'Usuario',
          entityId: userSelectResult.id,
        }),
      );
    });

    it('debe lanzar ConflictException si el correo ya está registrado (P2002)', async () => {
      const prismaError = Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
        clientVersion: '6.0',
      });
      mockPrisma.user.create.mockRejectedValue(prismaError);

      await expect(service.create(dto as any, 1)).rejects.toThrow(
        ConflictException,
      );
    });

    it('debe re-lanzar errores que no sean P2002', async () => {
      const prismaError = Object.assign(new Error('Server error'), {
        code: 'P1000',
        clientVersion: '6.0',
      });
      mockPrisma.user.create.mockRejectedValue(prismaError);

      await expect(service.create(dto as any, 1)).rejects.toThrow(
        'Server error',
      );
    });
  });

  describe('findAll', () => {
    it('debe retornar lista paginada por defecto', async () => {
      const users = [userSelectResult];
      mockPrisma.user.findMany.mockResolvedValue(users);
      mockPrisma.user.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(result.data).toEqual(users);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
          orderBy: { id: 'asc' },
        }),
      );
    });

    it('debe calcular paginación correctamente en página 2', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(25);

      const result = await service.findAll({ page: 2, limit: 10 });

      expect(result.meta).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      });
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('debe filtrar por búsqueda (name/email)', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll({ search: 'Carlos', page: 1, limit: 10 });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { name: { contains: 'Carlos' } },
              { email: { contains: 'Carlos' } },
            ],
          }),
        }),
      );
    });

    it('debe filtrar por isActive', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll({ isActive: false, page: 1, limit: 10 });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('debe filtrar por role', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockPrisma.user.count.mockResolvedValue(0);

      await service.findAll({ role: Role.SUPERVISOR, page: 1, limit: 10 });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: Role.SUPERVISOR }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('debe retornar usuario por id', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(userSelectResult);

      const result = await service.findOne(1);

      expect(result).toEqual(userSelectResult);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
        }),
      );
    });

    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('debe actualizar un usuario existente', async () => {
      const updated = { ...userSelectResult, name: 'Nombre Actualizado' };
      mockPrisma.user.findUnique.mockImplementation(async (args: any) => {
        if (args.where?.id) return userSelectResult;
        return null;
      });
      mockPrisma.user.update.mockResolvedValue(updated);

      const result = await service.update(1, { name: 'Nombre Actualizado' }, 1);

      expect(result).toEqual(updated);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACTUALIZAR',
          entity: 'Usuario',
          entityId: 1,
        }),
      );
    });

    it('debe lanzar ConflictException si el nuevo correo ya está registrado', async () => {
      mockPrisma.user.findUnique.mockImplementation(async (args: any) => {
        if (args.where?.id) return userSelectResult;
        if (args.where?.email === 'otro@test.com')
          return { id: 2, email: 'otro@test.com' };
        return null;
      });

      await expect(
        service.update(1, { email: 'otro@test.com' } as any, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('debe hashear la contraseña si se proporciona en el DTO', async () => {
      mockPrisma.user.findUnique.mockImplementation(
        async () => userSelectResult,
      );
      mockPrisma.user.update.mockResolvedValue(userSelectResult);

      await service.update(1, { password: 'nuevaPassword123' }, 1);

      expect(bcrypt.hash).toHaveBeenCalledWith('nuevaPassword123', 10);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            passwordHash: 'hashed_password',
          }),
        }),
      );
    });

    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockImplementation(async () => null);

      await expect(
        service.update(999, { name: 'Test' } as any, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('debe activar un usuario', async () => {
      const inactiveUser = { ...userSelectResult, isActive: false };
      mockPrisma.user.findUnique.mockResolvedValue(inactiveUser);
      mockPrisma.user.update.mockResolvedValue({
        ...inactiveUser,
        isActive: true,
      });

      const result = await service.updateStatus(1, true, 1);

      expect(result.isActive).toBe(true);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ACTIVAR',
          entity: 'Usuario',
          entityId: 1,
          oldValues: { isActive: false },
          newValues: { isActive: true },
        }),
      );
    });

    it('debe desactivar un usuario no-admin', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(userSelectResult);
      mockPrisma.user.update.mockResolvedValue({
        ...userSelectResult,
        isActive: false,
      });

      const result = await service.updateStatus(1, false, 1);

      expect(result.isActive).toBe(false);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DESACTIVAR',
        }),
      );
    });

    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus(999, true, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debe bloquear desactivacion del administrador principal (admin@empresa.com)', async () => {
      const mainAdmin = {
        ...userSelectResult,
        email: 'admin@empresa.com',
        role: Role.ADMINISTRADOR,
      };
      mockPrisma.user.findUnique.mockResolvedValue(mainAdmin);

      await expect(service.updateStatus(1, false, 1)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.updateStatus(1, false, 1)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'ADMIN_PRINCIPAL_NO_DESACTIVABLE',
        }),
      });
    });

    it('debe bloquear desactivacion si no queda ningun administrador activo', async () => {
      const admin = {
        ...userSelectResult,
        email: 'otro.admin@test.com',
        role: Role.ADMINISTRADOR,
      };
      mockPrisma.user.findUnique.mockResolvedValue(admin);
      mockPrisma.user.count.mockResolvedValue(1);

      await expect(service.updateStatus(1, false, 1)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.updateStatus(1, false, 1)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'ADMIN_REQUERIDO',
        }),
      });
    });

    it('debe permitir desactivar un administrador si hay otros activos', async () => {
      const admin = {
        ...userSelectResult,
        email: 'otro.admin@test.com',
        role: Role.ADMINISTRADOR,
      };
      mockPrisma.user.findUnique.mockResolvedValue(admin);
      mockPrisma.user.count.mockResolvedValue(3);
      mockPrisma.user.update.mockResolvedValue({ ...admin, isActive: false });

      const result = await service.updateStatus(1, false, 1);

      expect(result.isActive).toBe(false);
    });

    it('debe permitir reactivar el administrador principal', async () => {
      const mainAdmin = {
        ...userSelectResult,
        email: 'admin@empresa.com',
        role: Role.ADMINISTRADOR,
        isActive: false,
      };
      mockPrisma.user.findUnique.mockResolvedValue(mainAdmin);
      mockPrisma.user.update.mockResolvedValue({
        ...mainAdmin,
        isActive: true,
      });

      const result = await service.updateStatus(1, true, 1);

      expect(result.isActive).toBe(true);
    });
  });

  describe('resetPassword', () => {
    it('debe restablecer la contraseña exitosamente', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(userSelectResult);
      mockPrisma.user.update.mockResolvedValue(userSelectResult);

      const result = await service.resetPassword(1, 'nuevaPass123', 1);

      expect(result).toEqual({
        message: 'Contraseña actualizada exitosamente',
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('nuevaPass123', 10);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: { passwordHash: 'hashed_password' },
        }),
      );
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RESTABLECER_CONTRASEÑA',
          entity: 'Usuario',
          entityId: 1,
        }),
      );
    });

    it('debe lanzar NotFoundException si el usuario no existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword(999, 'pass123', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getStats', () => {
    it('debe retornar estadísticas correctamente', async () => {
      mockPrisma.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(7);
      mockPrisma.user.groupBy.mockResolvedValue([
        { role: Role.GESTION_HUMANA, _count: { role: 5 } },
        { role: Role.SUPERVISOR, _count: { role: 3 } },
        { role: Role.ADMINISTRADOR, _count: { role: 2 } },
      ]);

      const result = await service.getStats();

      expect(result).toEqual({
        total: 10,
        active: 7,
        inactive: 3,
        byRole: {
          GESTION_HUMANA: 5,
          SUPERVISOR: 3,
          ADMINISTRADOR: 2,
        },
      });
    });

    it('debe retornar estadísticas vacías cuando no hay usuarios', async () => {
      mockPrisma.user.count.mockResolvedValue(0);
      mockPrisma.user.groupBy.mockResolvedValue([]);

      const result = await service.getStats();

      expect(result).toEqual({
        total: 0,
        active: 0,
        inactive: 0,
        byRole: {},
      });
    });
  });
});
