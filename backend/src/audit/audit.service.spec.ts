import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditService', () => {
  let service: AuditService;

  const mockPrisma = {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
  });

  describe('log', () => {
    it('debe crear un registro de auditoría', async () => {
      mockPrisma.auditLog.create.mockResolvedValue({ id: 1 });

      const result = await service.log({
        userId: 1,
        action: 'CREAR',
        entity: 'Empleado',
        entityId: 1,
        newValues: { name: 'Test' },
      });

      expect(result).toHaveProperty('id', 1);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREAR',
            entity: 'Empleado',
          }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('debe retornar lista paginada de auditoría', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { id: 1, action: 'CREAR' },
      ]);
      mockPrisma.auditLog.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
