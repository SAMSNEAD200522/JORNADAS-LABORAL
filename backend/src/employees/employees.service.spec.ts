import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { EmployeeDocumentType } from '@prisma/client';

describe('EmployeesService', () => {
  let service: EmployeesService;

  const mockPrisma = {
    employee: {
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    schedule: {
      findUnique: jest.fn(),
    },
    workConfig: {
      findUnique: jest.fn(),
    },
  };

  const mockAudit = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
  });

  describe('create', () => {
    const dto = {
      documentType: EmployeeDocumentType.CC,
      documentNumber: '1234567890',
      firstName: 'Carlos',
      lastName: 'Ramirez',
      email: 'carlos@test.com',
      position: 'Developer',
      area: 'Tech',
    };

    it('debe crear un empleado exitosamente', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);
      mockPrisma.workConfig.findUnique.mockResolvedValue(null);
      mockPrisma.employee.create.mockResolvedValue({ id: 1, ...dto, isActive: true });

      const result = await service.create(dto as any);

      expect(result).toHaveProperty('id', 1);
      expect(mockPrisma.employee.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ documentNumber: '1234567890' }),
        }),
      );
    });

    it('debe rechazar documento duplicado', async () => {
      const prismaError = Object.assign(new Error('Unique constraint'), { code: 'P2002', clientVersion: '6.0' });
      mockPrisma.employee.create.mockRejectedValue(prismaError);

      await expect(service.create(dto as any)).rejects.toThrow(ConflictException);
    });

    it('debe rechazar horario inexistente', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ ...dto, scheduleId: 999 } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('debe retornar lista paginada', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([{ id: 1 }]);
      mockPrisma.employee.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 } as any);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta.total).toBe(1);
    });

    it('debe buscar empleados por search (nombre/apellido/documento)', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([{ id: 1, firstName: 'Carlos' }]);
      mockPrisma.employee.count.mockResolvedValue(1);

      const result = await service.findAll({ search: 'Carlos', page: 1, limit: 10 } as any);

      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ firstName: { contains: 'Carlos' } }),
            ]),
          }),
        }),
      );
      expect(result.meta.total).toBe(1);
    });

    it('debe filtrar por isActive=true', async () => {
      mockPrisma.employee.findMany.mockResolvedValue([{ id: 1, isActive: true }]);
      mockPrisma.employee.count.mockResolvedValue(1);

      await service.findAll({ isActive: true, page: 1, limit: 10 } as any);

      expect(mockPrisma.employee.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('debe retornar empleado por id', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 1, firstName: 'Carlos' });

      const result = await service.findOne(1);
      expect(result).toHaveProperty('id', 1);
    });

    it('debe lanzar 404 si no existe', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('debe actualizar un empleado existente', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.employee.update.mockResolvedValue({ id: 1, position: 'Nuevo Cargo' });

      const result = await service.update(1, { position: 'Nuevo Cargo' } as any);
      expect(result).toHaveProperty('position', 'Nuevo Cargo');
    });
  });

  describe('updateStatus', () => {
    it('debe activar empleado', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.employee.update.mockResolvedValue({ id: 1, isActive: true });

      const result = await service.updateStatus(1, true);
      expect(result).toHaveProperty('isActive', true);
    });

    it('debe desactivar empleado', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({ id: 1 });
      mockPrisma.employee.update.mockResolvedValue({ id: 1, isActive: false });

      const result = await service.updateStatus(1, false);
      expect(result).toHaveProperty('isActive', false);
    });

    it('debe lanzar 404 si el empleado no existe', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.updateStatus(999, false)).rejects.toThrow(NotFoundException);
    });
  });
});
