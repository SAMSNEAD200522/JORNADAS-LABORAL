import { Test, TestingModule } from '@nestjs/testing';
import { HolidaysService } from './holidays.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('HolidaysService', () => {
  let service: HolidaysService;

  const mockPrisma = {
    holiday: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockAudit = {
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HolidaysService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<HolidaysService>(HolidaysService);
  });

  describe('create', () => {
    const dto = { date: '2026-07-20', name: 'Día de la Independencia' };

    it('debe crear un festivo exitosamente', async () => {
      mockPrisma.holiday.create.mockResolvedValue({
        id: 1,
        ...dto,
        date: new Date('2026-07-20'),
      });

      const result = await service.create(dto, 1);
      expect(result).toHaveProperty('id', 1);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREAR',
          entity: 'Festivo',
          userId: 1,
        }),
      );
    });

    it('debe rechazar festivo duplicado', async () => {
      const prismaError = Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
        clientVersion: '6.0',
      });
      mockPrisma.holiday.create.mockRejectedValue(prismaError);

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('debe retornar todos los festivos ordenados por fecha', async () => {
      mockPrisma.holiday.findMany.mockResolvedValue([
        { id: 1, date: new Date('2026-01-01'), name: 'Año Nuevo' },
      ]);

      const result = await service.findAll();
      expect(result).toHaveLength(1);
      expect(mockPrisma.holiday.findMany).toHaveBeenCalledWith({
        orderBy: { date: 'asc' },
      });
    });
  });

  describe('findOne', () => {
    it('debe retornar un festivo por id', async () => {
      mockPrisma.holiday.findUnique.mockResolvedValue({
        id: 1,
        date: new Date('2026-07-20'),
        name: 'Independencia',
      });

      const result = await service.findOne(1);
      expect(result).toHaveProperty('id', 1);
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      mockPrisma.holiday.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('debe eliminar un festivo exitosamente', async () => {
      mockPrisma.holiday.findUnique.mockResolvedValue({
        id: 1,
        date: new Date('2026-07-20'),
        name: 'Independencia',
      });
      mockPrisma.holiday.delete.mockResolvedValue({ id: 1 });

      await service.remove(1, 1);
      expect(mockAudit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ELIMINAR',
          entity: 'Festivo',
          userId: 1,
        }),
      );
    });

    it('debe lanzar NotFoundException al eliminar festivo inexistente', async () => {
      mockPrisma.holiday.findUnique.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
