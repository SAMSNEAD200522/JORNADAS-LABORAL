import { Test, TestingModule } from '@nestjs/testing';
import { WorkSessionsService } from './work-sessions.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { LaborEngineService } from '../labor-engine/labor-engine.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('WorkSessionsService', () => {
  let service: WorkSessionsService;

  const mockEngine = {
    classify: jest.fn(),
  };

  const mockAudit = {
    log: jest.fn(),
  };

  const mockPrisma = {
    employee: {
      findUnique: jest.fn(),
    },
    workSession: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalMinutes: null } }),
    },
    holiday: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkSessionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: LaborEngineService, useValue: mockEngine },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get<WorkSessionsService>(WorkSessionsService);
  });

  describe('create', () => {
    const validDto = {
      employeeId: 1,
      startTime: '2026-07-08T07:00:00.000Z',
      endTime: '2026-07-08T17:00:00.000Z',
    };

    const defaultClassification = {
      totalMinutes: 600,
      ordinaryMinutes: 600,
      nightSurchargeMinutes: 0,
      extraDayMinutes: 0,
      extraNightMinutes: 0,
      sundayMinutes: 0,
      holidayMinutes: 0,
    };

    it('debe crear una jornada exitosamente con clasificación', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 1,
        isActive: true,
        workModality: 'ADMINISTRATIVO',
        weeklyTargetMinutes: 2520,
        workConfig: { breakMinutes: 60, ordinaryDistributions: [] },
      });
      mockEngine.classify.mockReturnValue(defaultClassification);
      mockPrisma.workSession.create.mockResolvedValue({
        id: 1,
        employeeId: 1,
        startTime: new Date(validDto.startTime),
        endTime: new Date(validDto.endTime),
        isVoided: false,
        compensatoryType: null,
        voidReason: null,
        ...defaultClassification,
      });

      const result = await service.create(validDto);
      expect(result).toHaveProperty('totalMinutes', 600);
      expect(result).toHaveProperty('ordinaryMinutes', 600);
      expect(mockEngine.classify).toHaveBeenCalledTimes(1);
    });

    it('debe rechazar empleado inexistente', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(service.create(validDto)).rejects.toThrow(NotFoundException);
    });

    it('debe rechazar empleado inactivo', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 1,
        isActive: false,
        workModality: 'ADMINISTRATIVO',
        weeklyTargetMinutes: 2520,
        workConfig: { breakMinutes: 60, ordinaryDistributions: [] },
      });

      await expect(service.create(validDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe rechazar endTime <= startTime', async () => {
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 1,
        isActive: true,
        workModality: 'ADMINISTRATIVO',
        weeklyTargetMinutes: 2520,
        workConfig: { breakMinutes: 60, ordinaryDistributions: [] },
      });

      await expect(
        service.create({
          employeeId: 1,
          startTime: '2026-07-08T17:00:00.000Z',
          endTime: '2026-07-08T07:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('debe retornar lista paginada (sin anuladas por defecto)', async () => {
      mockPrisma.workSession.findMany.mockResolvedValue([{ id: 1 }]);
      mockPrisma.workSession.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.meta.total).toBe(1);
    });
  });

  describe('findOne', () => {
    it('debe retornar una jornada por id', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue({ id: 1 });

      const result = await service.findOne(1);
      expect(result).toHaveProperty('id', 1);
    });
  });

  describe('update', () => {
    it('debe actualizar y reclasificar', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValueOnce({
        id: 1,
        isVoided: false,
        employeeId: 1,
        startTime: new Date('2026-07-08T07:00:00.000Z'),
        endTime: new Date('2026-07-08T17:00:00.000Z'),
        compensatoryType: null,
        compensatoryObservation: null,
      });
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 1,
        workModality: 'ADMINISTRATIVO',
        weeklyTargetMinutes: 2520,
        workConfig: { breakMinutes: 60, ordinaryDistributions: [] },
      });
      mockEngine.classify.mockReturnValue({
        totalMinutes: 300,
        ordinaryMinutes: 300,
        nightSurchargeMinutes: 0,
        extraDayMinutes: 0,
        extraNightMinutes: 0,
        sundayMinutes: 0,
        holidayMinutes: 0,
      });
      mockPrisma.workSession.update.mockResolvedValue({
        id: 1,
        totalMinutes: 300,
      });

      const result = await service.update(1, {
        startTime: '2026-07-08T07:00:00.000Z',
        endTime: '2026-07-08T12:00:00.000Z',
      });
      expect(result).toHaveProperty('totalMinutes', 300);
    });

    it('debe rechazar actualizar jornada anulada', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue({
        id: 1,
        isVoided: true,
        compensatoryType: null,
        compensatoryObservation: null,
      });

      await expect(service.update(1, {} as any)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe cambiar de empleado y reclasificar con los datos del nuevo', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue({
        id: 1,
        isVoided: false,
        employeeId: 1,
        startTime: new Date('2026-07-08T07:00:00.000Z'),
        endTime: new Date('2026-07-08T17:00:00.000Z'),
        compensatoryType: null,
        compensatoryObservation: null,
      });
      mockPrisma.employee.findUnique
        .mockResolvedValueOnce({ id: 2 })
        .mockResolvedValueOnce({
          id: 2,
          workModality: 'ADMINISTRATIVO',
          weeklyTargetMinutes: 2520,
          workConfig: { breakMinutes: 60, ordinaryDistributions: [] },
        });
      const newClassification = {
        totalMinutes: 300,
        ordinaryMinutes: 300,
        nightSurchargeMinutes: 0,
        extraDayMinutes: 0,
        extraNightMinutes: 0,
        sundayMinutes: 0,
        holidayMinutes: 0,
      };
      mockEngine.classify.mockReturnValue(newClassification);
      mockPrisma.workSession.update.mockResolvedValue({
        id: 1,
        employeeId: 2,
        ...newClassification,
      });

      const result = await service.update(1, { employeeId: 2 });

      expect(result).toHaveProperty('employeeId', 2);
      expect(mockPrisma.employee.findUnique).toHaveBeenNthCalledWith(1, {
        where: { id: 2 },
      });
    });

    it('debe rechazar cambio a empleado inexistente', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue({
        id: 1,
        isVoided: false,
        employeeId: 1,
        startTime: new Date('2026-07-08T07:00:00.000Z'),
        endTime: new Date('2026-07-08T17:00:00.000Z'),
        compensatoryType: null,
        compensatoryObservation: null,
      });
      mockPrisma.employee.findUnique.mockResolvedValue(null);

      await expect(
        service.update(1, { employeeId: 999 } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('debe mantener empleado actual si no se envía employeeId', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue({
        id: 1,
        isVoided: false,
        employeeId: 1,
        startTime: new Date('2026-07-08T07:00:00.000Z'),
        endTime: new Date('2026-07-08T17:00:00.000Z'),
        compensatoryType: null,
        compensatoryObservation: null,
      });
      mockPrisma.employee.findUnique.mockResolvedValueOnce({
        id: 1,
        workModality: 'ADMINISTRATIVO',
        weeklyTargetMinutes: 2520,
        workConfig: { breakMinutes: 60, ordinaryDistributions: [] },
      });
      mockEngine.classify.mockReturnValue({
        totalMinutes: 600,
        ordinaryMinutes: 600,
        nightSurchargeMinutes: 0,
        extraDayMinutes: 0,
        extraNightMinutes: 0,
        sundayMinutes: 0,
        holidayMinutes: 0,
      });
      mockPrisma.workSession.update.mockResolvedValue({
        id: 1,
        employeeId: 1,
        totalMinutes: 600,
      });

      const result = await service.update(1, {
        startTime: '2026-07-08T08:00:00.000Z',
      });

      expect(result).toHaveProperty('employeeId', 1);
      expect(mockPrisma.employee.findUnique).toHaveBeenCalledTimes(1);
    });
  });

  describe('void', () => {
    it('debe anular una jornada', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue({
        id: 1,
        isVoided: false,
        compensatoryType: null,
        compensatoryObservation: null,
      });
      mockPrisma.workSession.update.mockResolvedValue({
        id: 1,
        isVoided: true,
        voidedReason: 'Error',
      });

      const result = await service.void(1, { reason: 'Error' });
      expect(result).toHaveProperty('isVoided', true);
    });
  });

  describe('recalculate', () => {
    it('debe recalcular con el motor', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue({
        id: 1,
        isVoided: false,
        employeeId: 1,
        startTime: new Date('2026-07-08T07:00:00.000Z'),
        endTime: new Date('2026-07-08T17:00:00.000Z'),
        totalMinutes: 600,
        compensatoryType: null,
        compensatoryObservation: null,
      });
      mockPrisma.employee.findUnique.mockResolvedValue({
        id: 1,
        workModality: 'ADMINISTRATIVO',
        weeklyTargetMinutes: 2520,
        workConfig: { breakMinutes: 60, ordinaryDistributions: [] },
      });
      mockEngine.classify.mockReturnValue({
        totalMinutes: 600,
        ordinaryMinutes: 600,
        nightSurchargeMinutes: 0,
        extraDayMinutes: 0,
        extraNightMinutes: 0,
        sundayMinutes: 0,
        holidayMinutes: 0,
      });
      mockPrisma.workSession.update.mockResolvedValue({
        id: 1,
        totalMinutes: 600,
      });

      const result = await service.recalculate(1);
      expect(result).toHaveProperty('totalMinutes', 600);
    });

    it('debe rechazar recalcular jornada anulada', async () => {
      mockPrisma.workSession.findUnique.mockResolvedValue({
        id: 1,
        isVoided: true,
      });

      await expect(service.recalculate(1)).rejects.toThrow(BadRequestException);
    });
  });
});
